import { readBlockConfig } from '../../scripts/aem.js';
import { resolveEndpoint, sitePath } from '../../scripts/knowledge-api.js';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function resultCard(result) {
  const path = sitePath(result?.url);
  if (!path) return null;
  const item = element('li', 'backend-search-result');
  const heading = element('h3');
  const link = element('a', 'backend-search-result-link', result.title || 'Tech Council');
  link.href = path;
  heading.append(link);
  const type = element('p', 'backend-search-result-type', result.type || 'page');
  item.append(type, heading);
  if (result.description) item.append(element('p', 'backend-search-result-description', result.description));
  return item;
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const id = `backend-search-${document.querySelectorAll('.backend-search-form').length}`;
  const search = element('search');
  const form = element('form', 'backend-search-form');
  form.method = 'post';
  form.setAttribute('aria-labelledby', `${id}-label`);
  const label = element('label', 'backend-search-label', 'Search Tech Council');
  label.htmlFor = id;
  label.id = `${id}-label`;
  const help = element('p', 'backend-search-help', 'Communities, sessions, recordings, and resources. Start with 3 characters.');
  help.id = `${id}-help`;
  const toolbar = element('div', 'backend-search-toolbar');
  const input = element('input', 'backend-search-input');
  input.id = id;
  input.name = 'query';
  input.type = 'search';
  input.placeholder = 'Search by topic or ask a question';
  input.required = true;
  input.minLength = 3;
  input.maxLength = 500;
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';
  input.setAttribute('aria-describedby', `${help.id} ${id}-status`);
  const submit = element('button', 'backend-search-submit');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Search');
  submit.title = 'Search';
  const clear = element('button', 'backend-search-clear');
  clear.type = 'reset';
  clear.setAttribute('aria-label', 'Clear search');
  clear.title = 'Clear search';
  toolbar.append(input, submit, clear);
  form.append(label, help, toolbar);
  search.append(form);
  const status = element('p', 'backend-search-status');
  status.id = `${id}-status`;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  const region = element('section', 'backend-search-results');
  region.setAttribute('aria-label', 'Search results');
  region.hidden = true;
  const answer = element('p', 'backend-search-answer');
  const results = element('ul', 'backend-search-list');
  region.append(answer, results);
  const loading = element('div', 'backend-search-loading');
  loading.setAttribute('aria-hidden', 'true');
  loading.hidden = true;
  for (let index = 0; index < 3; index += 1) {
    const placeholder = element('div', 'backend-search-placeholder');
    placeholder.append(element('span'), element('span'), element('span'));
    loading.append(placeholder);
  }
  block.replaceChildren(search, status, loading, region);
  block.dataset.state = 'idle';

  let active;
  let debounceTimer;
  let composing = false;
  const idle = () => {
    clearTimeout(debounceTimer);
    active?.abort();
    active = null;
    submit.disabled = false;
    submit.setAttribute('aria-label', 'Search');
    form.setAttribute('aria-busy', 'false');
    status.textContent = '';
    results.replaceChildren();
    region.hidden = true;
    loading.hidden = true;
    input.removeAttribute('aria-invalid');
    block.dataset.state = 'idle';
  };
  const scheduleSearch = (event) => {
    idle();
    if (composing || event?.isComposing || input.value.trim().length < 3) return;
    debounceTimer = setTimeout(() => form.requestSubmit(), 300);
  };
  input.addEventListener('input', scheduleSearch);
  input.addEventListener('compositionstart', () => {
    composing = true;
    idle();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    scheduleSearch();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  });
  form.addEventListener('reset', () => {
    composing = false;
    idle();
    input.value = '';
    input.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 3) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Enter at least 3 characters to search.';
      input.focus();
      return;
    }
    active?.abort();
    const controller = new AbortController();
    active = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12000);
    submit.disabled = true;
    submit.setAttribute('aria-label', 'Searching');
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Searching Tech Council...';
    results.replaceChildren();
    region.hidden = true;
    loading.hidden = false;
    block.dataset.state = 'loading';
    try {
      const endpoint = resolveEndpoint(config.endpoint, '/api/search');
      form.action = endpoint;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 6 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Search is temporarily unavailable. Please try again.');
      const json = await response.json();
      if (!Array.isArray(json.results)) throw new Error('Search returned an invalid response. Please try again.');
      if (active !== controller) return;
      const cards = json.results.slice(0, 10).map(resultCard).filter(Boolean);
      cards.forEach((card, index) => card.style.setProperty('--result-index', index));
      results.append(...cards);
      answer.textContent = typeof json.answer === 'string' ? json.answer : '';
      answer.hidden = !answer.textContent;
      region.hidden = !cards.length && !answer.textContent;
      block.dataset.state = cards.length ? 'success' : 'empty';
      status.textContent = cards.length
        ? `${cards.length} ${cards.length === 1 ? 'result' : 'results'} for "${query}".`
        : 'No matching results. Try a different topic or a more specific question.';
    } catch (error) {
      if (active !== controller) return;
      if (controller.signal.aborted && !timedOut) return;
      block.dataset.state = 'error';
      status.textContent = timedOut
        ? 'Search took too long. Please try again.'
        : 'Search could not connect. Please try again. If this continues, contact the Tech Council team.';
    } finally {
      clearTimeout(timer);
      if (active === controller) {
        active = null;
        submit.disabled = false;
        submit.setAttribute('aria-label', 'Search');
        loading.hidden = true;
        form.setAttribute('aria-busy', 'false');
      }
    }
  });
}
