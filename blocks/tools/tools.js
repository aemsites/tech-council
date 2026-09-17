/**
 * Tools block.
 *
 * Renders tools from a sheet-style JSON data source: a search bar at the top
 * and a responsive grid of clickable cards below.
 *
 * Authoring pattern (data-source mode):
 *  | Tools                          |
 *  | /forms/tools-forms/tools.json  |
 *
 * The single content cell holds a link (or plain-text URL) to a JSON endpoint
 * shaped like `{ "data": [ { title, description, link } ] }`.
 *
 * @param {HTMLElement} block
 */

/** A field is empty when null/undefined or blank after trimming. */
function isEmptyField(value) {
  if (value == null) return true;
  return String(value).trim() === '';
}

/** Trims a field to a string, treating blank as empty (''). */
function normalizeField(value) {
  return isEmptyField(value) ? '' : String(value).trim();
}

/** Returns true only for http/https (or relative) URLs; rejects javascript:, data:, etc. */
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim(), window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Debounces a function so it runs only after `ms` ms of no further calls. */
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

function toRelativeUrl(input) {
  if (!input) return '';
  try {
    const parsed = new URL(input, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return '';
  }
}

/** Resolve the JSON source URL from the block's single authored cell. */
function getSourceUrl(block) {
  const cell = block.querySelector(':scope > div > div');
  if (!cell) return '';
  const link = cell.querySelector('a[href]')?.href;
  const raw = cell.textContent?.trim();
  return toRelativeUrl(link || raw);
}

async function fetchToolsData(sourceUrl) {
  try {
    const resp = await fetch(sourceUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      console.warn('[Tools] Sheet fetch failed:', resp.status, resp.statusText, sourceUrl);
      return [];
    }
    const json = await resp.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch (e) {
    console.warn('[Tools] Sheet fetch error:', e?.message || e, sourceUrl);
    return [];
  }
}

/** Deterministic non-negative hash of a string. */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) % 1000000007;
  }
  return h;
}

/** Destination for the "Add a tool" button (same-origin submission form). */
const SUBMIT_TOOL_URL = '/toolsubmission';

/** On-brand soft-tint palette (hue) for monogram tiles. */
const MONO_HUES = [258, 230, 280, 200, 165, 320];

/** Derive 1–2 letter initials from a title. */
function getInitials(title) {
  const words = title.split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The known primary types; anything else falls under "others". */
const KNOWN_TYPES = ['skill', 'agent', 'app'];

/** Type filters shown below the search bar (in display order). */
const TYPE_FILTERS = [
  {
    value: 'all',
    label: 'All',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="M2 16l10 5 10-5"/></svg>',
  },
  {
    value: 'skill',
    label: 'Skills',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
  },
  {
    value: 'agent',
    label: 'Agents',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01"/></svg>',
  },
  {
    value: 'app',
    label: 'Apps',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18"/></svg>',
  },
  {
    value: 'others',
    label: 'Others',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  },
];

/** Whether a row matches the active type filter. */
function matchesActiveType(row, active) {
  if (!active || active === 'all') return true;
  const t = normalizeField(row.type).toLowerCase();
  if (active === 'others') return !KNOWN_TYPES.includes(t);
  return t === active;
}

/** Build one clickable card for a tool row. */
function buildToolCard(row, rowIdx) {
  const title = normalizeField(row.title);
  const description = normalizeField(row.description);
  const link = normalizeField(row.link);
  const type = normalizeField(row.type);
  const hasLink = link && isSafeUrl(link);

  const li = document.createElement('li');
  li.className = 'tools-card';
  li.style.setProperty('--i', String(rowIdx));

  const card = document.createElement(hasLink ? 'a' : 'div');
  card.className = 'tools-card-inner';
  if (hasLink) {
    card.href = link;
    card.target = '_blank';
    card.rel = 'noopener';
    if (title) card.setAttribute('aria-label', title);
  }

  // Header: monogram + title
  const header = document.createElement('div');
  header.className = 'tools-card-header';

  const mono = document.createElement('span');
  mono.className = 'tools-card-mono';
  mono.setAttribute('aria-hidden', 'true');
  const hue = MONO_HUES[hashCode(title) % MONO_HUES.length];
  mono.style.setProperty('--h', String(hue));
  mono.textContent = getInitials(title);

  const titleEl = document.createElement('h3');
  titleEl.className = 'tools-title';
  titleEl.textContent = title;
  if (!title) titleEl.classList.add('is-empty');

  header.append(mono, titleEl);

  // Body: description (clamped)
  const descEl = document.createElement('p');
  descEl.className = 'tools-description';
  descEl.textContent = description;
  if (!description) descEl.classList.add('is-empty');

  card.append(header, descEl);

  // Footer: type badge + open affordance
  if (type || hasLink) {
    const footer = document.createElement('div');
    footer.className = 'tools-card-footer';

    const typeEl = document.createElement('span');
    typeEl.className = 'tools-card-type';
    if (type) {
      typeEl.textContent = type;
      typeEl.dataset.type = type.toLowerCase();
    }
    footer.append(typeEl);

    if (hasLink) {
      const open = document.createElement('span');
      open.className = 'tools-card-open';
      open.setAttribute('aria-hidden', 'true');
      open.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M7 17L17 7M9 7h8v8"/>
        </svg>`;
      footer.append(open);
    }

    card.append(footer);
  }

  li.append(card);
  return li;
}

/**
 * Filter data by the active type filter and the search query (search is
 * scoped to the selected type). Keeps the sheet's authored order.
 */
function getFilteredData(block) {
  const data = block.toolsData || [];
  const query = (block.toolsSearchQuery || '').trim().toLowerCase();
  const active = block.toolsActiveType || 'all';
  return data.filter((row) => {
    if (!matchesActiveType(row, active)) return false;
    if (!query) return true;
    const title = normalizeField(row.title).toLowerCase();
    const description = normalizeField(row.description).toLowerCase();
    return title.includes(query) || description.includes(query);
  });
}

/** Re-render the list and count from the current search query. */
function updateToolsList(block) {
  const listContainer = block.querySelector('.tools-list');
  const emptyEl = block.querySelector('.tools-empty');
  if (!listContainer) return;

  const rows = getFilteredData(block);
  listContainer.innerHTML = '';

  if (rows.length === 0) {
    listContainer.classList.add('is-empty');
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  listContainer.classList.remove('is-empty');
  if (emptyEl) emptyEl.hidden = true;
  rows.forEach((row, idx) => listContainer.append(buildToolCard(row, idx)));
}

let toolsBlockCount = 0;

/** Top toolbar: search bar + result count. */
function createToolbar(block) {
  const toolbar = document.createElement('div');
  toolbar.className = 'tools-toolbar';

  const searchId = `tools-search-${toolsBlockCount += 1}`;
  const search = document.createElement('input');
  search.type = 'search';
  search.id = searchId;
  search.className = 'tools-search';
  search.placeholder = 'Search tools…';
  search.setAttribute('aria-label', 'Search tools');

  const applySearch = debounce(() => {
    block.toolsSearchQuery = search.value;
    updateToolsList(block);
  }, 180);
  search.addEventListener('input', () => applySearch());

  const submit = document.createElement('a');
  submit.className = 'tools-submit';
  submit.href = SUBMIT_TOOL_URL;
  submit.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    <span>Add a tool</span>`;

  toolbar.append(search, submit);
  return toolbar;
}

/** Filter bar with icon chips for each type, shown below the search bar. */
function createFilterBar(block) {
  const bar = document.createElement('div');
  bar.className = 'tools-filters';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter tools by type');

  TYPE_FILTERS.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-filter';
    btn.dataset.value = f.value;
    const active = (block.toolsActiveType || 'all') === f.value;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));

    const icon = document.createElement('span');
    icon.className = 'tools-filter-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = f.icon;

    const label = document.createElement('span');
    label.className = 'tools-filter-label';
    label.textContent = f.label;

    btn.append(icon, label);

    btn.addEventListener('click', () => {
      block.toolsActiveType = f.value;
      bar.querySelectorAll('.tools-filter').forEach((b) => {
        const on = b.dataset.value === f.value;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      updateToolsList(block);
    });

    bar.append(btn);
  });

  return bar;
}

/** Render tools with a top search bar and a card grid. */
function renderFromSheet(block, data) {
  block.toolsData = data;
  block.toolsSearchQuery = '';
  block.toolsActiveType = 'all';

  block.textContent = '';

  const toolbar = createToolbar(block);
  const filterBar = createFilterBar(block);

  const listContainer = document.createElement('ul');
  listContainer.className = 'tools-list';

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'tools-empty';
  emptyMsg.textContent = 'No tools match your search.';
  emptyMsg.hidden = true;

  block.append(toolbar, filterBar, listContainer, emptyMsg);

  updateToolsList(block);
}

export default async function decorate(block) {
  const sourceUrl = getSourceUrl(block);
  if (!sourceUrl) {
    block.textContent = '';
    return;
  }
  const data = await fetchToolsData(sourceUrl);
  if (data.length > 0) {
    renderFromSheet(block, data);
  } else {
    block.textContent = '';
  }
}
