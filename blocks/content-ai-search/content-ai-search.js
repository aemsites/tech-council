/*
 * Content AI request contract adapted from Apoorv-R98/content-ai-search-block
 * (Apache-2.0), commit 7d740506d6e5005a5b863d38f85bd9318bd6bdd5.
 * Site adaptation: accessible controls, safe DOM rendering,
 * lazy AI requests, cancellation, and site tokens. See the repository LICENSE.
 */
import { readBlockConfig } from '../../scripts/aem.js';

let instance = 0;
const MAX_TOP_UP_REQUESTS = 3;
const RESULT_FIELDS = [
  'source', 'text', 'title', 'metadata.url', 'metadata.source',
  'metadata.title', 'metadata.description', 'metadata.image', 'metadata.meta.image',
];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = `content-ai-search-${className}`;
  if (text) node.textContent = text;
  return node;
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function appendInline(parent, text) {
  const tokens = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|https?:\/\/[^\s<>]+/g;
  let offset = 0;
  Array.from(text.matchAll(tokens)).forEach((match) => {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    if (match[3]) {
      parent.append(element('strong', '', match[3]));
    } else {
      const rawUrl = match[2] || match[0].replace(/[).,;:!?]+$/, '');
      const url = safeUrl(rawUrl);
      const link = element(url ? 'a' : 'span', '', match[1] || rawUrl);
      if (url) {
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      parent.append(link);
      if (!match[2]) parent.append(document.createTextNode(match[0].slice(rawUrl.length)));
    }
    offset = match.index + match[0].length;
  });
  parent.append(document.createTextNode(text.slice(offset)));
}

function renderAnswer(container, text) {
  container.replaceChildren();
  let list;
  text.split(/\r?\n/).filter((line) => line.trim()).forEach((line) => {
    const isItem = /^\s*[-*]\s+/.test(line);
    if (isItem && !list) {
      list = element('ul');
      container.append(list);
    }
    const node = element(isItem ? 'li' : 'p');
    appendInline(node, line.replace(/^\s*(?:[-*]\s+|#{1,6}\s+)/, '').trim());
    if (isItem) list.append(node);
    else {
      list = null;
      container.append(node);
    }
  });
}

function normalizeResult(item) {
  const data = item.data || {};
  const meta = data.metadata || {};
  const url = safeUrl(data.source || meta.url || meta.source);
  if (!url) return null;
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  let label = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
  try {
    label = decodeURIComponent(label).replace(/[-_]/g, ' ');
  } catch {
    // Keep the original label when the source has malformed percent encoding.
  }
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return {
    key: parsed.href,
    url,
    title: meta.title || data.title || label,
    description: meta.description || (typeof data.text === 'string'
      ? data.text.replace(/[#*_`]/g, '').replace(/\s+/g, ' ').slice(0, 180) : ''),
    image: safeUrl(meta.image || meta.meta?.image),
  };
}

function resultCard(result) {
  const item = element('li');
  const link = element('a', 'result');
  link.href = result.url;
  if (result.image) {
    const image = element('img');
    image.src = result.image;
    image.alt = '';
    image.loading = 'lazy';
    link.append(image);
  }
  const body = element('div', 'result-body');
  body.append(element('span', 'result-source', new URL(result.url).hostname.replace(/^www\./, '')));
  body.append(element('h2', '', result.title));
  if (result.description) body.append(element('p', '', result.description));
  link.append(body);
  item.append(link);
  return item;
}

function hybridQuery(text) {
  const words = text.split(/\s+/).length;
  return {
    type: 'composite',
    operator: 'OR',
    queries: [
      { type: 'vector', text, options: { numCandidates: 50, boost: 1 } },
      {
        type: 'fulltext',
        text,
        options: {
          boost: words > 1 ? 1 / (5 * words) : 1,
          operator: 'AND',
          matchStrategy: 'COMBINED_FIELDS',
        },
      },
    ],
  };
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const baseUrl = safeUrl(config['base-url']);
  const source = config['content-source'];
  const size = Math.max(1, Math.min(50, parseInt(config['results-size'], 10) || 10));
  const aiEnabled = config['ai-search-mode-enabled'] !== 'false';
  const retryEnabled = config['gen-search-error-retry-visible'] !== 'false';
  const prefix = config.id || `content-ai-search-${instance += 1}`;
  let layout = config['results-layout'] === 'list' ? 'list' : 'card';

  block.replaceChildren();
  if (config.id) block.id = config.id;
  if (!baseUrl || !source) {
    block.append(element('p', 'error', 'Search is not configured. Please contact the site team.'));
    return;
  }
  if (config['notice-text']) {
    block.append(element('p', 'notice', config['notice-text']));
  }

  const form = element('form', 'form');
  form.setAttribute('role', 'search');
  form.action = window.location.pathname;
  form.method = 'get';
  const label = element('label', '', 'Search');
  label.htmlFor = `${prefix}-query`;
  const field = element('div', 'field');
  const input = element('input');
  input.id = label.htmlFor;
  input.type = 'search';
  input.name = 'q';
  input.placeholder = config.placeholder || 'Ask a question or enter a topic';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('autocorrect', 'off');
  input.enterKeyHint = 'search';
  input.maxLength = 1000;
  const submit = element('button', '', 'Search');
  submit.type = 'submit';
  const clear = element('button', 'clear', 'Clear');
  clear.type = 'button';
  clear.hidden = true;
  field.append(input, submit, clear);
  form.append(label, field);

  const tabs = element('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Search mode');
  const panels = {};
  const buttons = {};
  const modes = aiEnabled ? ['results', 'ai'] : ['results'];
  modes.forEach((mode) => {
    const button = element('button', 'tab', mode === 'results' ? 'Search Results' : 'AI Mode');
    button.type = 'button';
    button.id = `${prefix}-tab-${mode}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `${prefix}-${mode}`);
    const panel = element('div', 'panel');
    panel.id = `${prefix}-${mode}`;
    if (aiEnabled) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
    }
    panel.tabIndex = 0;
    buttons[mode] = button;
    panels[mode] = panel;
    tabs.append(button);
  });

  const resultsStatus = element('p', 'status', 'Enter a query to search.');
  resultsStatus.setAttribute('role', 'status');
  const toolbar = element('div', 'toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Results layout');
  const layouts = ['card', 'list'].map((value) => {
    const button = element('button', 'layout', value === 'card' ? 'Cards' : 'List');
    button.type = 'button';
    button.addEventListener('click', () => {
      layout = value;
      // eslint-disable-next-line no-use-before-define
      updateLayout();
    });
    toolbar.append(button);
    return button;
  });
  toolbar.hidden = true;
  const resultsList = element('ul', 'results');
  resultsList.setAttribute('role', 'list');
  const more = element('button', 'more', 'Load more results');
  more.type = 'button';
  more.hidden = true;
  const retryResults = element('button', 'retry', 'Try again');
  retryResults.type = 'button';
  retryResults.hidden = true;
  panels.results.classList.add('content-ai-search-results-panel');
  panels.results.append(resultsStatus, toolbar, resultsList, more, retryResults);

  const answerStatus = element('p', 'status', 'Enter a query to generate an answer.');
  answerStatus.setAttribute('role', 'status');
  const answer = element('div', 'answer');
  const answerText = element('div', 'answer-text');
  const sourcesHeading = element('h3', '', 'Sources');
  const sources = element('ul', 'sources');
  sources.setAttribute('role', 'list');
  answer.append(
    element('h2', '', 'Generative answer'),
    element('p', 'attribution', 'Powered by Adobe Content AI'),
    answerText,
    sourcesHeading,
    sources,
  );
  const disclaimer = element(
    'p',
    'disclaimer',
    config['disclaimer-text'] || 'AI-generated answers may be inaccurate. Verify information with the sources.',
  );
  answer.append(disclaimer);
  answer.hidden = true;
  const retryAnswer = element('button', 'retry', 'Try again');
  retryAnswer.type = 'button';
  retryAnswer.hidden = true;
  if (aiEnabled) panels.ai.append(answerStatus, answer, retryAnswer);

  block.append(form);
  if (aiEnabled) block.append(tabs);
  modes.forEach((mode) => block.append(panels[mode]));

  let query = '';
  let activeMode = 'results';
  let version = 0;
  let resultsLoaded = false;
  let answerLoaded = false;
  let cursor = null;
  let results = [];
  let resultsController;
  let answerController;

  function updateLayout() {
    resultsList.dataset.layout = layout;
    layouts.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(layout === (index === 0 ? 'card' : 'list')));
    });
  }

  async function request(route, body, signal) {
    const url = `${baseUrl.replace(/\/+$/, '')}/${route}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentSource: { name: source, type: config['content-source-type'] || 'AEM_PUBLISH' },
        ...body,
      }),
      signal,
    });
    if (!response.ok) throw new Error('Search request failed');
    return response.json();
  }

  async function loadResults(append = false) {
    if (resultsController || !query) return;
    const currentVersion = version;
    const controller = new AbortController();
    resultsController = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    panels.results.setAttribute('aria-busy', 'true');
    resultsStatus.textContent = append ? 'Loading more results…' : 'Searching…';
    retryResults.hidden = true;
    more.disabled = true;
    try {
      const seen = new Set(append ? results.map((item) => item.key) : []);
      const nextResults = append ? [...results] : [];
      const target = nextResults.length + size;
      let next = append ? cursor : null;
      for (let page = 0; page < MAX_TOP_UP_REQUESTS; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const data = await request('search', {
          query: hybridQuery(query),
          queryOptions: {
            resultFields: { includes: RESULT_FIELDS },
            pagination: { limit: size, ...(next ? { cursor: next } : {}) },
          },
        }, controller.signal);
        if (currentVersion !== version) return;
        if (!Array.isArray(data.results)) throw new Error('Invalid search response');
        data.results.filter(Boolean).map(normalizeResult).filter(Boolean).forEach((item) => {
          if (!seen.has(item.key)) {
            seen.add(item.key);
            nextResults.push(item);
          }
        });
        const previous = next;
        next = typeof data.cursor === 'string' && data.cursor !== previous ? data.cursor : null;
        if (!next || nextResults.length >= target) break;
      }
      results = nextResults;
      cursor = next;
      resultsLoaded = true;
      resultsList.replaceChildren(...results.map(resultCard));
      resultsStatus.textContent = results.length
        ? `${results.length} result${results.length === 1 ? '' : 's'} shown.`
        : 'No results found. Try a different query.';
      toolbar.hidden = !results.length;
      more.hidden = !cursor;
    } catch {
      if (currentVersion !== version) return;
      resultsStatus.textContent = append
        ? 'Could not load more results. Your previous results are still available.'
        : 'Search is unavailable. Try again. For a live integration, check the proxy’s allowed origins and source configuration.';
      retryResults.hidden = append;
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        resultsController = null;
        panels.results.setAttribute('aria-busy', 'false');
        more.disabled = false;
      }
    }
  }

  async function loadAnswer() {
    if (answerController || !query || !aiEnabled) return;
    const currentVersion = version;
    const controller = new AbortController();
    answerController = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    panels.ai.setAttribute('aria-busy', 'true');
    answerStatus.textContent = 'Generating answer…';
    retryAnswer.hidden = true;
    answer.hidden = true;
    try {
      const data = await request('gensearch', { query }, controller.signal);
      if (currentVersion !== version) return;
      if (typeof data.result !== 'string') throw new Error('Invalid answer response');
      renderAnswer(answerText, data.result);
      sources.replaceChildren();
      const seen = new Set();
      (Array.isArray(data.hits) ? data.hits : []).filter(Boolean).forEach((hit) => {
        const result = normalizeResult({ data: hit.data || hit });
        if (!result || seen.has(result.key)) return;
        seen.add(result.key);
        const item = element('li');
        const link = element('a', '', result.title);
        link.href = result.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        sources.append(item);
      });
      sourcesHeading.hidden = !sources.children.length;
      answerLoaded = true;
      answer.hidden = !data.result.trim();
      answerStatus.textContent = answer.hidden ? 'No answer found. Try another question.' : 'Answer ready.';
    } catch {
      if (currentVersion !== version) return;
      answerStatus.textContent = 'An AI answer is currently unavailable. Try again or use Search Results.';
      retryAnswer.hidden = !retryEnabled;
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        answerController = null;
        panels.ai.setAttribute('aria-busy', 'false');
      }
    }
  }

  function activate(mode) {
    activeMode = mode;
    tabs.hidden = !query;
    modes.forEach((value) => {
      panels[value].hidden = !query || value !== mode;
      buttons[value].setAttribute('aria-selected', String(value === mode));
      buttons[value].tabIndex = value === mode ? 0 : -1;
    });
    if (mode === 'ai' && !answerLoaded) loadAnswer();
    if (mode === 'results' && !resultsLoaded) loadResults();
  }

  function reset() {
    version += 1;
    resultsController?.abort();
    answerController?.abort();
    resultsController = null;
    answerController = null;
    resultsLoaded = false;
    answerLoaded = false;
    results = [];
    cursor = null;
    query = '';
    resultsList.replaceChildren();
    answer.hidden = true;
    toolbar.hidden = true;
    more.hidden = true;
    more.disabled = false;
    retryResults.hidden = true;
    retryAnswer.hidden = true;
    resultsStatus.textContent = 'Enter a query to search.';
    answerStatus.textContent = 'Enter a query to generate an answer.';
    modes.forEach((mode) => panels[mode].setAttribute('aria-busy', 'false'));
    activate(activeMode);
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }

  function search() {
    reset();
    query = input.value.trim();
    clear.hidden = !input.value;
    updateUrl();
    activate(activeMode);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    if (!input.value.trim()) {
      reset();
      updateUrl();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    reset();
    updateUrl();
    input.focus();
  });
  more.addEventListener('click', () => loadResults(true));
  retryResults.addEventListener('click', () => loadResults());
  retryAnswer.addEventListener('click', loadAnswer);
  modes.forEach((mode, index) => {
    buttons[mode].addEventListener('click', () => activate(mode));
    buttons[mode].addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = (index + 1) % modes.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = modes.length - 1;
      const target = modes[next];
      activate(target);
      buttons[target].focus();
    });
  });
  updateLayout();
  activate('results');
  input.value = new URLSearchParams(window.location.search).get('q') || '';
  if (input.value) search();
}
