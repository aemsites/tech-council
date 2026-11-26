/*
 * Content AI request contract adapted from Apoorv-R98/content-ai-search-block
 * (Apache-2.0), commit 7d740506d6e5005a5b863d38f85bd9318bd6bdd5.
 * Site adaptation: accessible controls, safe DOM rendering,
 * concurrent search and AI requests, cancellation, and site tokens. See the repository LICENSE.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import normalizeSheetRow from '../../utils/sheet.js';
import { getRecordingCategory, getRecordingTags } from '../../utils/recording-fields.js';
import parseRecordingTime, { getRecordingTime, formatRecordingTime } from '../../utils/recording-time.js';

let instance = 0;
const MAX_TOP_UP_REQUESTS = 3;
const TECH_COUNCIL_ORIGIN = 'https://techcouncil.corp.adobe.com';
const FALLBACK_IMAGE = new URL('./fallback.svg', import.meta.url).href;
const PAGE_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'shtml', 'php', 'asp', 'aspx', 'jsp']);
const RESULT_FIELDS = [
  'source', 'text', 'title', 'metadata.url', 'metadata.source',
  'metadata.title', 'metadata.description', 'metadata.image', 'metadata.meta.image',
];
let sourcePagesPromise;

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

function decodedPath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function sourceKey(value) {
  const safe = safeUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  const siteHost = /^(?:techcouncil\.corp\.adobe\.com|[\w-]+--tech-council--aemsites\.aem\.(?:page|live))$/i;
  if (url.origin !== window.location.origin
    && (url.protocol !== 'https:' || url.port || !siteHost.test(url.hostname))) return '';
  const path = decodedPath(url.pathname).replace(/\/+$/, '').replace(/\.html$/i, '') || '/';
  const talk = url.searchParams.get('talk')?.trim();
  return path === '/recordings' && talk ? `${path}?${new URLSearchParams({ talk })}` : path;
}

function resultUrls(item) {
  const data = item.data || item;
  const meta = data.metadata || {};
  return [data.source, meta.canonical_url, meta.url, meta.source, meta.meta?.url];
}

function sourcePage(value, sourcePages) {
  if (!sourcePages) return undefined;
  const key = sourceKey(value);
  if (/^\/fragments\/(?:communities\/(?:[^/]+\/)?)?events-fragment$/i.test(key)) {
    return { url: `${TECH_COUNCIL_ORIGIN}/events`, title: 'Events', type: 'event' };
  }
  return sourcePages.get(key);
}

function buildSourcePages(recordings) {
  const pages = new Map();
  recordings.map(normalizeSheetRow).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title || title === '0') return;
    const url = new URL('/recordings', TECH_COUNCIL_ORIGIN);
    url.searchParams.set('talk', title);
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const page = {
      url: url.href,
      title,
      description: description === '0' ? '' : description,
      type: 'recording',
      speaker: row.speaker,
      category: getRecordingCategory(row),
      tags: getRecordingTags(row),
      date: row.date,
    };
    const recordingKey = sourceKey(url.href);
    if (!pages.has(recordingKey)) pages.set(recordingKey, page);
    [row.summary, row.transcript].forEach((fragment) => {
      const key = sourceKey(fragment);
      if (key.startsWith('/fragments/tech-talks-summary/') && !pages.has(key)) {
        pages.set(key, page);
      }
    });
  });
  return pages;
}

async function loadSourcePages(items, text = '') {
  const needsPages = /\/fragments\/tech-talks-summary\/|\/recordings(?:\.html)?\/?\?[^\s]*\btalk=/i.test(text) || items.filter(Boolean)
    .some((item) => resultUrls(item)
      .some((value) => {
        const key = sourceKey(value);
        return key.startsWith('/fragments/tech-talks-summary/')
          || key.startsWith('/recordings?talk=');
      }));
  if (!needsPages) return new Map();
  if (!sourcePagesPromise) {
    sourcePagesPromise = fetch('/forms/recording-form/recordings.json?sheet=recordings', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Recording page links are unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload.data)) throw new Error('Invalid recording page links');
      return buildSourcePages(payload.data);
    }).catch(() => {
      sourcePagesPromise = null;
      return new Map();
    });
  }
  return sourcePagesPromise;
}

function pageUrl(value, sourcePages) {
  const url = safeUrl(value);
  if (!url) return '';
  const path = decodedPath(new URL(url).pathname).replace(/\/+$/, '') || '/';
  if (/\/admin(?:\/|\.html?$|$)/i.test(path)) return '';
  const file = path.split('/').pop() || '';
  const extension = file.match(/\.([a-z][a-z\d]*)$/i)?.[1].toLowerCase();
  if (extension && !PAGE_EXTENSIONS.has(extension)) return '';
  const page = sourcePage(url, sourcePages);
  if (page) {
    const mapped = new URL(page.url);
    const original = new URL(url);
    const time = getRecordingTime(original);
    if (time !== null && mapped.pathname === '/recordings') {
      mapped.searchParams.set('t', String(time));
    }
    return mapped.href;
  }
  return /\/fragments(?:\/|\.html?$|$)/i.test(path) ? '' : url;
}

function appendInline(parent, text, sourcePages) {
  const tokens = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|https?:\/\/[^\s<>"'`{}]+/g;
  let offset = 0;
  let omitted = false;
  Array.from(text.matchAll(tokens)).forEach((match) => {
    parent.append(document.createTextNode(text.slice(offset, match.index)));
    if (match[3]) {
      const strong = element('strong');
      omitted = appendInline(strong, match[3], sourcePages) || omitted;
      parent.append(strong);
    } else {
      const rawUrl = match[2] || match[0].replace(/[).,;:!?]+$/, '');
      const url = pageUrl(rawUrl, sourcePages);
      if (url) {
        const label = (match[1] || sourcePage(rawUrl, sourcePages)?.title || rawUrl).replace(
          /https?:\/\/[^\s<>"'`{}]+/g,
          (candidate) => {
            const value = candidate.replace(/[).,;:!?]+$/, '');
            const destination = pageUrl(value, sourcePages);
            return destination ? sourcePage(value, sourcePages)?.title || destination : '';
          },
        );
        if (label.trim()) {
          const link = element('a', '', label);
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          parent.append(link);
        } else omitted = true;
      } else {
        omitted = true;
        if (match[1]) appendInline(parent, match[1], sourcePages);
      }
      if (!match[2]) parent.append(document.createTextNode(match[0].slice(rawUrl.length)));
    }
    offset = match.index + match[0].length;
  });
  parent.append(document.createTextNode(text.slice(offset)));
  return omitted;
}

function removeUnmatchedClosingParentheses(node) {
  let depth = 0;
  const keepBalanced = (character) => {
    if (character === '(') {
      depth += 1;
      return character;
    }
    if (!depth) return '';
    depth -= 1;
    return character;
  };
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    text.textContent = text.textContent.replace(/[()]/g, keepBalanced);
  }
}

function renderAnswer(container, text, sourcePages) {
  container.replaceChildren();
  let list;
  text.split(/\r?\n/).filter((line) => line.trim()).forEach((line) => {
    const isItem = /^\s*[-*]\s+/.test(line);
    if (isItem && !list) {
      list = element('ul');
      container.append(list);
    }
    const node = element(isItem ? 'li' : 'p');
    const omitted = appendInline(
      node,
      line.replace(/^\s*(?:[-*]\s+|#{1,6}\s+)/, '').trim(),
      sourcePages,
    );
    if (omitted) removeUnmatchedClosingParentheses(node);
    // Drop citation-only lines when their URL is excluded.
    if (omitted && /^(?:[^:]*:)?[\s.,;:!?-]*$/.test(node.textContent.replace(/`/g, ''))) return;
    if (isItem) list.append(node);
    else {
      list = null;
      container.append(node);
    }
  });
  container.querySelectorAll('ul').forEach((node) => {
    if (node.children.length) return;
    const previous = node.previousElementSibling;
    if (previous?.tagName === 'P' && previous.textContent.trim().endsWith(':')) previous.remove();
    node.remove();
  });
}

function metadataText(value) {
  return typeof value === 'string' && value.trim() !== '0' ? value.trim() : '';
}

function resultDate(value) {
  if (value == null || value === '' || value === '0' || value === 0) return null;
  const number = Number(value);
  const date = Number.isFinite(number) ? (number - 25569) * 86400000 : Date.parse(value);
  return Number.isFinite(date) && Math.abs(date) <= 8640000000000000 ? date : null;
}

function searchExcerpt(text, query) {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2)
    .sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  const match = terms.map((term) => lower.indexOf(term)).find((index) => index >= 0) ?? 0;
  let start = Math.max(0, match - 60);
  if (start) start = text.indexOf(' ', start) + 1 || start;
  const excerpt = text.slice(start, start + 180).trim();
  return `${start ? '…' : ''}${excerpt}${start + 180 < text.length ? '…' : ''}`;
}

function normalizeResult(item, sourcePages, query = '') {
  const data = item.data || item;
  const meta = data.metadata || {};
  if (/^(?:Adobe Inc\s*-\s*)?Sign In$/i.test(String(meta.title || data.title || '').trim())) return null;
  const urls = resultUrls(item);
  const source = urls.find((value) => sourcePage(value, sourcePages))
    || urls.find((value) => pageUrl(value))
    || urls.find((value) => pageUrl(value, sourcePages));
  const url = pageUrl(source, sourcePages);
  if (!url) return null;
  const parsed = new URL(url);
  const time = getRecordingTime(parsed)
    ?? parseRecordingTime(data.startSeconds)
    ?? parseRecordingTime(meta.startSeconds);
  if (time !== null && sourceKey(url).startsWith('/recordings?talk=')) {
    parsed.searchParams.set('t', String(time));
  }
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  let label = decodedPath(parsed.pathname).split('/').filter(Boolean).pop() || '';
  label = (label || parsed.hostname).replace(/[-_]/g, ' ');
  label = label.charAt(0).toUpperCase() + label.slice(1);
  const page = sourcePage(source, sourcePages);
  const recording = sourceKey(url).startsWith('/recordings?talk=');
  const talkTitle = recording ? parsed.searchParams.get('talk') : '';
  const title = page?.title || talkTitle || meta.title || data.title || label;
  const genericDescription = recording && metadataText(meta.title).toLowerCase() === 'recordings';
  const authoredDescription = page?.description
    || (!genericDescription ? metadataText(meta.description) : '');
  const preview = element('div');
  renderAnswer(
    preview,
    authoredDescription || metadataText(data.text),
    sourcePages,
  );
  let description = Array.from(preview.querySelectorAll('p, li'), (node) => node.textContent)
    .join(' ').replace(/\s+/g, ' ').trim();
  if (genericDescription && description === metadataText(meta.description)) description = '';
  const speakers = metadataText(page?.speaker || meta.speaker).split(/[,;]/)
    .map((speaker) => speaker.trim()).filter(Boolean);
  if (!description && recording) {
    description = `Watch ${title}${speakers.length ? ` by ${speakers.join(', ')}` : ''}.`;
  }
  let type = 'page';
  if (recording) type = 'recording';
  else if (/(?:^|\/)events(?:\/|$)/i.test(sourceKey(url))) type = 'event';
  return {
    key: parsed.href,
    url: parsed.href,
    title,
    description: authoredDescription ? description : searchExcerpt(description.replace(/[#*_`]/g, ''), query),
    image: safeUrl(meta.image || meta.meta?.image),
    type: page?.type || type,
    speakers,
    category: page?.category ?? metadataText(meta.category ?? meta.tag),
    tags: page?.tags ?? getRecordingTags({ tags: meta.tags }),
    date: resultDate(page?.date || meta.date),
    startSeconds: time,
  };
}

function resultCard(result) {
  const item = element('li');
  const link = element('a', 'result');
  link.href = result.url;
  const image = element('img');
  image.alt = '';
  image.loading = 'lazy';
  if (result.image) {
    image.addEventListener('error', () => { image.src = FALLBACK_IMAGE; }, { once: true });
  }
  image.src = result.image || FALLBACK_IMAGE;
  link.append(image);
  const body = element('div', 'result-body');
  body.append(element('span', 'result-source', new URL(result.url).hostname.replace(/^www\./, '')));
  body.append(element('h3', '', result.title));
  const details = [
    result.speakers.join(', '),
    result.category,
    result.tags.join(', '),
    result.date === null ? '' : new Date(result.date).toLocaleDateString(),
    result.startSeconds === null ? '' : `At ${formatRecordingTime(result.startSeconds)}`,
  ].filter(Boolean);
  if (details.length) body.append(element('span', 'result-meta', details.join(' · ')));
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

function searchForm(prefix, placeholder, action, launcher) {
  const form = element('form', 'form');
  form.setAttribute('role', 'search');
  form.action = action;
  form.method = 'get';
  const label = element('label', 'visually-hidden', 'Search Tech Council');
  label.htmlFor = `${prefix}-query`;
  const field = element('div', 'field');
  const submit = element('button', 'submit');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Search');
  const input = element('input');
  input.id = label.htmlFor;
  input.type = 'search';
  input.name = 'q';
  input.placeholder = placeholder || 'Search Tech Council...';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('autocorrect', 'off');
  input.enterKeyHint = 'search';
  input.maxLength = 1000;
  const clear = element('button', 'clear');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Clear search');
  clear.hidden = true;
  const suggestion = element('button', 'suggestion');
  suggestion.type = 'submit';
  suggestion.hidden = true;
  const suggestionQuery = launcher ? element('span', 'suggestion-query') : suggestion;
  field.append(submit, input, clear);
  if (launcher) {
    label.className = 'content-ai-search-label';
    label.id = `${prefix}-label`;
    form.setAttribute('aria-labelledby', label.id);
    const group = element('div', 'input-group');
    const hint = element('p', 'hint', 'Find recordings, events and community resources.');
    hint.id = `${prefix}-hint`;
    input.setAttribute('aria-describedby', hint.id);
    const suggestionText = element('span', 'suggestion-text');
    suggestionText.append(suggestionQuery, element('span', 'suggestion-caption', 'Search Tech Council'));
    const shortcut = element('kbd', 'suggestion-key', 'Enter');
    shortcut.setAttribute('aria-hidden', 'true');
    suggestion.append(suggestionText, shortcut);
    group.append(field, suggestion);
    form.append(label, group, hint);
  } else {
    form.append(label, field, suggestion);
  }

  function updateInput() {
    const text = input.value.trim();
    clear.hidden = !input.value;
    suggestionQuery.textContent = text;
    suggestion.setAttribute('aria-label', text ? `Search for "${text}"` : 'Search');
    suggestion.hidden = !text || document.activeElement !== input;
  }

  input.addEventListener('input', updateInput);
  input.addEventListener('focus', updateInput);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !suggestion.hidden) {
      event.preventDefault();
      suggestion.hidden = true;
    }
    if (event.key === 'ArrowDown' && !suggestion.hidden) {
      event.preventDefault();
      suggestion.focus();
    }
  });
  suggestion.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'Escape') {
      event.preventDefault();
      input.focus();
      if (event.key === 'Escape') suggestion.hidden = true;
    }
  });
  form.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !form.contains(event.relatedTarget)) suggestion.hidden = true;
  });
  document.addEventListener('pointerdown', (event) => {
    if (!form.contains(event.target)) suggestion.hidden = true;
  });
  form.addEventListener('submit', (event) => {
    input.value = input.value.trim();
    suggestion.hidden = true;
    if (!input.value) {
      event.preventDefault();
      updateInput();
      input.focus();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    updateInput();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return {
    form, input, clear, updateInput,
  };
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const baseUrl = safeUrl(config['base-url']);
  const source = config['content-source'];
  const techCouncilProxy = config['api-contract'] === 'tech-council';
  const size = Math.max(1, Math.min(50, parseInt(config['results-size'], 10) || 10));
  const aiEnabled = config['ai-search-mode-enabled'] !== 'false';
  const retryEnabled = config['gen-search-error-retry-visible'] !== 'false';
  const prefix = config.id || `content-ai-search-${instance += 1}`;
  const layout = config['results-layout'] === 'card' ? 'card' : 'list';

  block.replaceChildren();
  if (config.id) block.id = config.id;
  const launcher = config['display-mode'] === 'launcher';
  const {
    form, input, clear, updateInput,
  } = searchForm(
    prefix,
    config.placeholder,
    launcher ? safeUrl(config['results-page'] || '/search') : window.location.pathname,
    launcher,
  );
  if (launcher) {
    block.classList.add('content-ai-search-launcher');
    block.append(form);
    return;
  }

  if (!baseUrl || !source) {
    block.append(element('p', 'error', 'Search is not configured. Please contact the site team.'));
    return;
  }
  document.body.classList.add('content-ai-search-page');
  const panels = { results: element('section', 'results-panel') };
  const modes = aiEnabled ? ['results', 'ai'] : ['results'];
  const resultsHeading = element('h2', 'results-heading', 'All Results');
  resultsHeading.id = `${prefix}-results-heading`;
  panels.results.setAttribute('aria-labelledby', resultsHeading.id);
  const queryHeading = element('h3', 'query-heading');
  const resultsStatus = element('p', 'status', 'Enter a query to search.');
  resultsStatus.setAttribute('role', 'status');
  const resultsList = element('ul', 'results');
  resultsList.setAttribute('role', 'list');
  resultsList.setAttribute('aria-label', 'Search results');
  resultsList.tabIndex = -1;
  resultsList.dataset.layout = layout;
  const more = element('button', 'more', 'Load more results');
  more.type = 'button';
  more.hidden = true;
  const retryResults = element('button', 'retry', 'Try again');
  retryResults.type = 'button';
  retryResults.hidden = true;
  panels.results.append(
    resultsHeading,
    queryHeading,
    resultsStatus,
    resultsList,
    more,
    retryResults,
  );

  const answerStatus = element('p', 'status', 'Enter a query to generate an answer.');
  answerStatus.setAttribute('role', 'status');
  const answer = element('div', 'answer');
  const answerText = element('div', 'answer-text');
  const sourceDisclosure = element('details', 'source-disclosure');
  const sourceSummary = element('summary', 'source-summary', 'Sources');
  const sourceCount = element('span', 'source-count');
  sourceSummary.append(sourceCount);
  const sources = element('ul', 'sources');
  sources.setAttribute('role', 'list');
  sourceDisclosure.append(sourceSummary, sources);
  const actions = element('div', 'answer-actions');
  const copy = element('button', 'copy');
  copy.type = 'button';
  copy.setAttribute('aria-label', 'Copy answer');
  copy.title = 'Copy answer';
  const copyStatus = element('span', 'copy-status');
  copyStatus.setAttribute('role', 'status');
  actions.append(copy, copyStatus);
  answer.append(
    answerText,
    sourceDisclosure,
    actions,
  );
  const disclaimer = element(
    'p',
    'disclaimer',
    config['disclaimer-text'] || 'AI-generated answers may be inaccurate. Verify information with the sources.',
  );
  answer.hidden = true;
  const retryAnswer = element('button', 'retry', 'Try again');
  retryAnswer.type = 'button';
  retryAnswer.hidden = true;
  const emptyHint = element('p', 'empty', 'Enter a topic or question to search Tech Council.');
  block.append(form, emptyHint);
  if (config['notice-text']) block.append(element('p', 'notice', config['notice-text']));
  if (aiEnabled) {
    panels.ai = element('section', 'ai-section');
    const heading = element('h2', 'ai-heading', 'AI Search Results');
    heading.id = `${prefix}-ai-heading`;
    panels.ai.setAttribute('aria-labelledby', heading.id);
    const body = element('div', 'ai-panel');
    body.append(answerStatus, answer, retryAnswer);
    const header = element('div', 'ai-header');
    const title = element('div', 'ai-title');
    title.append(heading, element('p', 'attribution', 'Powered by AEM content AI'));
    header.append(title, disclaimer);
    panels.ai.append(header, body);
    block.append(panels.ai);
  }
  block.append(panels.results);

  let query = '';
  let version = 0;
  let cursor = null;
  let results = [];
  let resultsController;
  let answerController;
  const filterControls = {};

  function updateUrl() {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    Object.entries(filterControls).forEach(([key, select]) => {
      if (select.value === 'all') url.searchParams.delete(key);
      else url.searchParams.set(key, select.value);
    });
    window.history.replaceState(window.history.state, '', url);
  }

  function renderResults() {
    const legacyCategory = filterControls.tag?.value;
    if (filterControls.category?.value === 'all' && legacyCategory !== 'all'
      && results.some((result) => result.category === legacyCategory)
      && !results.some((result) => result.tags.includes(legacyCategory))) {
      const option = element('option', '', legacyCategory);
      option.value = legacyCategory;
      filterControls.category.append(option);
      filterControls.category.value = legacyCategory;
      filterControls.tag.value = 'all';
      updateUrl();
    }
    ['speaker', 'category', 'tag'].forEach((key) => {
      const select = filterControls[key];
      if (!select) return;
      const selected = select.value;
      const values = new Set();
      results.forEach((result) => {
        if (key === 'speaker') result.speakers.forEach((speaker) => values.add(speaker));
        else if (key === 'category' && result.category) values.add(result.category);
        else if (key === 'tag') result.tags.forEach((tag) => values.add(tag));
      });
      if (selected !== 'all') values.add(selected);
      const first = select.firstElementChild;
      select.replaceChildren(first);
      [...values].sort((a, b) => a.localeCompare(b)).forEach((value) => {
        const option = element('option', '', value);
        option.value = value;
        select.append(option);
      });
      select.value = selected;
    });
    const state = Object.fromEntries(
      Object.entries(filterControls).map(([key, select]) => [key, select.value]),
    );
    const days = { '1m': 30, '3m': 90, '1y': 365 }[state.period];
    const cutoff = days ? Date.now() - days * 86400000 : null;
    const visible = results.filter((result) => (
      (!state.type || state.type === 'all' || result.type === state.type)
      && (!state.speaker || state.speaker === 'all' || result.speakers.includes(state.speaker))
      && (!state.category || state.category === 'all' || result.category === state.category)
      && (!state.tag || state.tag === 'all' || result.tags.includes(state.tag))
      && (cutoff === null || (result.date !== null && result.date >= cutoff))
    ));
    resultsList.replaceChildren(...visible.map(resultCard));
    resultsList.tabIndex = visible.length ? 0 : -1;
    if (results.length && !visible.length) {
      resultsStatus.textContent = 'No results match these filters. Clear filters to see the returned results.';
    } else if (visible.length) {
      const filtered = Object.values(state).some((value) => value !== 'all');
      resultsStatus.textContent = filtered
        ? `${visible.length} of ${results.length} returned results shown.`
        : `${visible.length} result${visible.length === 1 ? '' : 's'} shown.`;
    } else resultsStatus.textContent = 'No results found. Try a different query.';
  }

  if (techCouncilProxy) {
    const filters = element('div', 'filters');
    const filterNote = element(
      'p',
      'filter-note',
      'Filter these returned results. Filters do not change the AI answer.',
    );
    const params = new URLSearchParams(window.location.search);
    [
      ['type', 'Type', [['all', 'All types'], ['recording', 'Recordings'], ['event', 'Events'], ['page', 'Other pages']]],
      ['speaker', 'Speaker', [['all', 'All speakers']]],
      ['category', 'Category', [['all', 'All categories']]],
      ['tag', 'Tags', [['all', 'All tags']]],
      ['period', 'Date', [['all', 'All time'], ['1m', 'Last month'], ['3m', 'Last 3 months'], ['1y', 'Last year']]],
    ].forEach(([key, labelText, options]) => {
      const field = element('div', 'filter');
      const label = element('label', '', labelText);
      label.htmlFor = `${prefix}-filter-${key}`;
      const select = element('select');
      select.id = label.htmlFor;
      select.name = key;
      options.forEach(([value, text]) => {
        const option = element('option', '', text);
        option.value = value;
        select.append(option);
      });
      const selected = params.get(key);
      if (selected && ['speaker', 'category', 'tag'].includes(key) && selected !== 'all') {
        const option = element('option', '', selected);
        option.value = selected;
        select.append(option);
      }
      select.value = selected || 'all';
      if (!select.value) select.value = 'all';
      filterControls[key] = select;
      select.addEventListener('change', () => {
        updateUrl();
        renderResults();
      });
      field.append(label, select);
      filters.append(field);
    });
    const clearFilters = element('button', 'clear-filters', 'Clear filters');
    clearFilters.type = 'button';
    clearFilters.addEventListener('click', () => {
      Object.values(filterControls).forEach((select) => { select.value = 'all'; });
      updateUrl();
      renderResults();
    });
    filters.append(clearFilters, filterNote);
    resultsList.before(filters);
  }

  async function request(route, body, signal) {
    const action = techCouncilProxy
      ? { search: 'semantic-search', gensearch: 'content-ai-search' }[route]
      : route;
    const url = `${baseUrl.replace(/\/+$/, '')}/${action}`;
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
    const currentQuery = query;
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
      let hasMatches = false;
      const target = nextResults.length + size;
      let next = append ? cursor : null;
      for (let page = 0; page < MAX_TOP_UP_REQUESTS; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const data = await request('search', techCouncilProxy ? { query: currentQuery } : {
          query: hybridQuery(currentQuery),
          queryOptions: {
            resultFields: { includes: RESULT_FIELDS },
            pagination: { limit: size, ...(next ? { cursor: next } : {}) },
          },
        }, controller.signal);
        if (currentVersion !== version) return;
        if (!Array.isArray(data.results)) throw new Error('Invalid search response');
        // eslint-disable-next-line no-await-in-loop
        const sourcePages = techCouncilProxy ? await loadSourcePages(data.results) : undefined;
        if (currentVersion !== version) return;
        hasMatches ||= data.results.some(Boolean);
        data.results.filter(Boolean).map((item) => normalizeResult(item, sourcePages, currentQuery))
          .filter(Boolean).forEach((item) => {
            if (!seen.has(item.key)) {
              seen.add(item.key);
              nextResults.push(item);
            }
          });
        const previous = next;
        // The Tech Council proxy returns a cursor but does not currently honor cursor pagination.
        next = !techCouncilProxy && typeof data.cursor === 'string' && data.cursor !== previous
          ? data.cursor : null;
        if (!next || nextResults.length >= target) break;
      }
      results = nextResults;
      cursor = next;
      renderResults();
      if (!results.length && hasMatches) {
        resultsStatus.textContent = 'Matching content was found, but its page links are unavailable.';
      }
      more.hidden = !cursor;
    } catch {
      if (currentVersion !== version) return;
      resultsStatus.textContent = append
        ? 'Could not load more results. Your previous results are still available.'
        : 'Search is unavailable. Try again in a moment.';
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
    answerStatus.classList.remove('content-ai-search-visually-hidden');
    answerStatus.textContent = 'Generating answer…';
    retryAnswer.hidden = true;
    answer.hidden = true;
    try {
      const data = await request('gensearch', { query }, controller.signal);
      if (currentVersion !== version) return;
      if (typeof data.result !== 'string') throw new Error('Invalid answer response');
      const hits = (Array.isArray(data.hits) ? data.hits : []).filter(Boolean);
      const sourcePages = techCouncilProxy ? await loadSourcePages(hits, data.result) : undefined;
      if (currentVersion !== version) return;
      renderAnswer(answerText, data.result, sourcePages);
      sources.replaceChildren();
      const seen = new Set();
      hits.forEach((hit) => {
        const result = normalizeResult(hit, sourcePages, query);
        if (!result || seen.has(result.key)) return;
        seen.add(result.key);
        const item = element('li');
        const link = element('a', '', result.title);
        if (result.startSeconds !== null) {
          link.append(element('span', 'source-time', formatRecordingTime(result.startSeconds)));
        }
        link.href = result.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        if (result.speakers.length) {
          item.append(element('span', 'source-context', result.speakers.join(', ')));
        }
        sources.append(item);
      });
      sourceDisclosure.hidden = !sources.children.length;
      sourceDisclosure.open = false;
      sourceCount.textContent = ` (${sources.children.length})`;
      answer.hidden = !answerText.textContent.trim();
      answerStatus.textContent = answer.hidden ? 'No answer found. Try another question.' : 'Answer ready.';
      answerStatus.classList.toggle('content-ai-search-visually-hidden', !answer.hidden);
    } catch {
      if (currentVersion !== version) return;
      answerStatus.textContent = 'An AI answer is currently unavailable. Try again or browse the results below.';
      retryAnswer.hidden = !retryEnabled;
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        answerController = null;
        panels.ai.setAttribute('aria-busy', 'false');
      }
    }
  }

  function updateVisibility() {
    modes.forEach((mode) => { panels[mode].hidden = !query; });
    emptyHint.hidden = !!query;
    queryHeading.replaceChildren('Results for ', element('strong', '', query));
  }

  function reset() {
    version += 1;
    resultsController?.abort();
    answerController?.abort();
    resultsController = null;
    answerController = null;
    results = [];
    cursor = null;
    query = '';
    resultsList.replaceChildren();
    resultsList.tabIndex = -1;
    resultsList.scrollTop = 0;
    answer.hidden = true;
    sourceDisclosure.open = false;
    sourceDisclosure.hidden = true;
    sources.replaceChildren();
    more.hidden = true;
    more.disabled = false;
    retryResults.hidden = true;
    retryAnswer.hidden = true;
    copyStatus.textContent = '';
    copy.disabled = false;
    resultsStatus.textContent = 'Enter a query to search.';
    answerStatus.textContent = 'Enter a query to generate an answer.';
    modes.forEach((mode) => panels[mode].setAttribute('aria-busy', 'false'));
    updateVisibility();
  }

  function search() {
    reset();
    query = input.value.trim();
    clear.hidden = !input.value;
    updateUrl();
    updateVisibility();
    loadResults();
    if (aiEnabled) loadAnswer();
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
  more.addEventListener('click', () => loadResults(true));
  retryResults.addEventListener('click', () => loadResults());
  retryAnswer.addEventListener('click', loadAnswer);
  copy.addEventListener('click', async () => {
    const currentVersion = version;
    copy.disabled = true;
    copyStatus.textContent = '';
    try {
      await navigator.clipboard.writeText(answerText.innerText);
      if (currentVersion === version) copyStatus.textContent = 'Answer copied.';
    } catch {
      if (currentVersion === version) {
        copyStatus.textContent = 'Could not copy. Select the answer text to copy it.';
      }
    } finally {
      if (currentVersion === version) copy.disabled = false;
    }
  });
  updateVisibility();
  input.value = new URLSearchParams(window.location.search).get('q') || '';
  updateInput();
  if (input.value) search();
}
