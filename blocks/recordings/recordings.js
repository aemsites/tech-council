/**
 * Converts Excel serial date to a readable date string.
 * @param {string|number} value - Excel serial date (e.g. "46056") or ISO date string
 * @returns {string} Formatted date or original value if not a number
 */
function formatSheetDate(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  // Excel serial: days since 1900-01-01 (Excel epoch). 25569 ≈ Jan 1, 1970 in Excel.
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Returns true only for http/https (or relative) URLs; rejects javascript:, data:, etc.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (t === '') return false;
  try {
    const u = new URL(t, window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Debounces a function so it runs only after `ms` ms of no further calls.
 * @param {(...args: unknown[]) => void} fn
 * @param {number} ms
 * @returns {(...args: unknown[]) => void}
 */
function debounce(fn, ms) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

/** EDS sheet path and origin. */
const RECORDINGS_SHEET_PATH = '/forms/recording-form/recordings-data.json?sheet=recordings';
const RECORDINGS_SHEET_ORIGIN = 'https://main--tech-council--aemsites.aem.page';

/**
 * Resolves the recordings sheet URL so the request is always same-origin (avoids 403 on production).
 * - On EDS host (aem.page): full same-origin URL.
 * - On localhost: relative path (proxy forwards to EDS with auth).
 * - On production/custom domain (e.g. techcouncilindia.corp.adobe.com): relative path so the
 *   request goes to the current origin; the backend serving that domain must serve the sheet.
 */
function getRecordingsSheetUrl() {
  const { origin } = window.location;
  if (origin === RECORDINGS_SHEET_ORIGIN) {
    return `${origin}${RECORDINGS_SHEET_PATH}`;
  }
  /* Use relative path for localhost and any other origin (e.g. production) so no cross-origin request */
  return RECORDINGS_SHEET_PATH;
}

/**
 * Fetches the recordings sheet and returns the "data" array.
 * @returns {Promise<Array>} Array of { title, speaker, recordingLink, presentationLink, date, tag }
 */
async function fetchRecordingsData() {
  const url = getRecordingsSheetUrl();
  try {
    const resp = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) {
      if (resp.status === 403) {
        console.warn(
          '[Recordings] 403 Forbidden — the sheet URL is not allowed for this request. '
          + 'Open the URL in a new tab to confirm. Fix: ensure the path is published and allowed in EDS config, or that the content source does not restrict anonymous access.',
          url,
        );
      } else {
        console.warn('[Recordings] Sheet fetch failed:', resp.status, resp.statusText, url);
      }
      return [];
    }
    const json = await resp.json();
    const data = Array.isArray(json.data) ? json.data : [];
    if (data.length === 0 && (!json.data || !Array.isArray(json.data))) {
      console.warn('[Recordings] No data array in response:', url, Object.keys(json));
    }
    return data;
  } catch (e) {
    console.warn('[Recordings] Sheet fetch error:', e?.message || e, url);
    return [];
  }
}

/** Base path for icons (e.g. '' or '/path'). */
function getRecordingsIconBase() {
  return (typeof window !== 'undefined' && window.hlx?.codeBasePath) || '';
}

/** Shared recording icon (play circle). If recordingLink is provided, wraps icon in a link. */
function createRecordingsCardIcon(recordingLink) {
  const wrapper = document.createElement('div');
  wrapper.className = 'recordings-card-icon';
  wrapper.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2" fill="rgba(106, 56, 255, 0.08)"/>
      <path d="M26 22v20l18-10-18-10z" fill="currentColor"/>
    </svg>`;
  if (recordingLink && isSafeUrl(recordingLink)) {
    const a = document.createElement('a');
    a.href = recordingLink;
    a.className = 'recordings-card-icon-link';
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    a.setAttribute('aria-label', 'Watch recording');
    a.dataset.tooltip = 'Watch recording';
    a.append(wrapper);
    return a;
  }
  return wrapper;
}

/** Presentation icon (PowerPoint). Only shown when presentationLink is present and safe; wraps in link. */
function createRecordingsCardPresentationIcon(presentationLink) {
  if (!presentationLink || !isSafeUrl(presentationLink)) return null;
  const img = document.createElement('img');
  img.src = `${getRecordingsIconBase()}/icons/powerpoint.svg`;
  img.alt = '';
  img.width = 28;
  img.height = 28;
  img.className = 'recordings-card-presentation-icon';
  img.setAttribute('aria-hidden', 'true');
  const a = document.createElement('a');
  a.href = presentationLink;
  a.className = 'recordings-card-presentation-link';
  a.setAttribute('target', '_blank');
  a.setAttribute('rel', 'noopener');
  a.setAttribute('aria-label', 'View presentation');
  a.dataset.tooltip = 'View presentation';
  a.append(img);
  return a;
}

/** Column of play icon and optional presentation icon below it. */
function createRecordingsCardIcons(recordingLink, presentationLink) {
  const col = document.createElement('div');
  col.className = 'recordings-card-icons';
  col.append(createRecordingsCardIcon(recordingLink));
  const presentationEl = createRecordingsCardPresentationIcon(presentationLink);
  if (presentationEl) col.append(presentationEl);
  return col;
}

/** Get numeric date for sorting (Excel serial or timestamp). Returns 0 if missing/invalid. */
function getSortDate(row) {
  const v = row.date;
  if (v == null || v === '') return 0;
  const num = Number(v);
  return Number.isNaN(num) ? 0 : num;
}

/** Get timestamp (ms) for date-range filtering. Returns null if no valid date. */
function getDateTimestamp(row) {
  const v = row.date;
  if (v == null || v === '') return null;
  const num = Number(v);
  if (Number.isNaN(num)) return null;
  return (num - 25569) * 86400 * 1000;
}

/** Date range filter keys and their label + ms ago. */
const DATE_RANGES = [
  { value: 'all', label: 'All time', msAgo: null },
  { value: '1m', label: 'Last month', msAgo: 30 * 24 * 60 * 60 * 1000 },
  { value: '3m', label: 'Last 3 months', msAgo: 3 * 30 * 24 * 60 * 60 * 1000 },
  { value: '6m', label: 'Last 6 months', msAgo: 6 * 30 * 24 * 60 * 60 * 1000 },
  { value: '1y', label: 'Last year', msAgo: 365 * 24 * 60 * 60 * 1000 },
];

/** Normalized tag for filtering: empty string becomes "Other" for display. */
const TAG_OTHER = 'Other';

function getRowTag(row) {
  const t = (row.tag || '').trim();
  return t === '' ? TAG_OTHER : t;
}

/** Collect unique tags from data (including "Other" if any row has no tag). */
function getUniqueTags(data) {
  const set = new Set();
  data.forEach((row) => set.add(getRowTag(row)));
  const list = [...set];
  list.sort((a, b) => (a === TAG_OTHER ? 1 : b === TAG_OTHER ? -1 : a.localeCompare(b)));
  return list;
}

/** Sort and filter data based on sidebar state. */
function getFilteredAndSortedData(block) {
  const data = block.recordingsData || [];
  const query = (block.recordingsSearchQuery || '').trim().toLowerCase();
  const sortBy = block.recordingsSortBy || 'date-desc';
  const dateRange = block.recordingsDateRange || 'all';
  const selectedTags = block.recordingsSelectedTags || new Set();

  let list = [...data];

  /* Text search (title / speaker) */
  if (query) {
    list = list.filter((row) => {
      const title = (row.title || '').toLowerCase();
      const speaker = (row.speaker || '').toLowerCase();
      return title.includes(query) || speaker.includes(query);
    });
  }

  /* Date range filter */
  if (dateRange !== 'all') {
    const range = DATE_RANGES.find((r) => r.value === dateRange);
    const cutoff = range?.msAgo ? Date.now() - range.msAgo : null;
    if (cutoff != null) {
      list = list.filter((row) => {
        const ts = getDateTimestamp(row);
        return ts != null && ts >= cutoff;
      });
    }
  }

  /* Tag filter: if any tag selected, keep only rows whose tag is in selected set */
  if (selectedTags.size > 0) {
    list = list.filter((row) => selectedTags.has(getRowTag(row)));
  }

  /* Sort: by date (items with date first, then no-date at end) or by title */
  if (sortBy === 'date-desc') {
    list.sort((a, b) => {
      const da = getSortDate(a);
      const db = getSortDate(b);
      if (da !== db) return db - da; /* higher date first; 0 (no date) goes to end */
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });
  } else if (sortBy === 'date-asc') {
    list.sort((a, b) => {
      const da = getSortDate(a);
      const db = getSortDate(b);
      if (da !== db) return da - db; /* lower date first; 0 (no date) goes to end */
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
    });
  } else if (sortBy === 'title-asc') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  } else if (sortBy === 'title-desc') {
    list.sort((a, b) => (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' }));
  }

  return list;
}

/** Build one list item DOM for a row. */
function buildRecordingsCard(row, rowIdx) {
  const li = document.createElement('li');
  li.style.setProperty('--i', String(rowIdx));

  const recordingLink = (row.recordingLink || '').trim();
  const presentationLink = (row.presentationLink || '').trim();

  li.append(createRecordingsCardIcons(recordingLink, presentationLink));

  const body = document.createElement('div');
  body.className = 'recordings-card-body';

  const title = row.title ? String(row.title).trim() : '';
  const speaker = row.speaker ? String(row.speaker).trim() : '';
  const dateStr = formatSheetDate(row.date);
  const tagRaw = (row.tag || '').trim();

  const titleEl = document.createElement('h3');
  titleEl.className = 'recordings-title';
  titleEl.textContent = title || '';
  if (!title) titleEl.classList.add('is-empty');
  body.append(titleEl);

  const speakerEl = document.createElement('p');
  speakerEl.className = 'recordings-speaker';
  speakerEl.textContent = speaker ? `By ${speaker}` : '';
  if (!speaker) speakerEl.classList.add('is-empty');
  body.append(speakerEl);

  const dateEl = document.createElement('p');
  dateEl.className = 'recordings-date';
  dateEl.textContent = dateStr || '';
  if (!dateStr) dateEl.classList.add('is-empty');
  body.append(dateEl);

  if (tagRaw !== '') {
    const tagEl = document.createElement('p');
    tagEl.className = 'recordings-tag';
    tagEl.textContent = tagRaw;
    body.append(tagEl);
  }

  li.append(body);
  return li;
}

/** Re-render only the list (ul) from current filter/sort. */
function updateRecordingsList(block) {
  const listContainer = block.querySelector('.recordings-list');
  const emptyEl = block.querySelector('.recordings-empty');
  if (!listContainer) return;

  const rows = getFilteredAndSortedData(block);
  listContainer.innerHTML = '';

  if (rows.length === 0) {
    listContainer.classList.add('is-empty');
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  listContainer.classList.remove('is-empty');
  if (emptyEl) emptyEl.hidden = true;
  rows.forEach((row, idx) => listContainer.append(buildRecordingsCard(row, idx)));
}

let recordingsBlockCount = 0;

/** Create left sidebar with sort, date range, tag filters, and optional search. */
function createSidebar(block, data) {
  const sidebar = document.createElement('aside');
  sidebar.className = 'recordings-sidebar';

  const searchId = `recordings-search-${recordingsBlockCount += 1}`;
  const searchWrap = document.createElement('div');
  searchWrap.className = 'recordings-filter-group';
  const searchLabel = document.createElement('label');
  searchLabel.className = 'recordings-filter-label';
  searchLabel.htmlFor = searchId;
  searchLabel.textContent = 'Search';
  const search = document.createElement('input');
  search.type = 'search';
  search.id = searchId;
  search.className = 'recordings-search';
  search.placeholder = 'Title or speaker…';
  search.setAttribute('aria-label', 'Search recordings');
  searchWrap.append(searchLabel, search);

  const sortWrap = document.createElement('div');
  sortWrap.className = 'recordings-filter-group';
  const sortLabel = document.createElement('label');
  sortLabel.htmlFor = 'recordings-sort';
  sortLabel.className = 'recordings-filter-label';
  sortLabel.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.id = 'recordings-sort';
  sortSelect.className = 'recordings-sort';
  sortSelect.setAttribute('aria-label', 'Sort recordings');
  [
    { value: 'date-desc', label: 'Date (newest first)' },
    { value: 'date-asc', label: 'Date (oldest first)' },
    { value: 'title-asc', label: 'Title A–Z' },
    { value: 'title-desc', label: 'Title Z–A' },
  ].forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    sortSelect.append(o);
  });
  sortWrap.append(sortLabel, sortSelect);

  const dateRangeWrap = document.createElement('div');
  dateRangeWrap.className = 'recordings-filter-group';
  const dateRangeLabel = document.createElement('span');
  dateRangeLabel.className = 'recordings-filter-label';
  dateRangeLabel.textContent = 'Time period';
  dateRangeWrap.append(dateRangeLabel);
  const dateRangeList = document.createElement('div');
  dateRangeList.className = 'recordings-filter-options';
  DATE_RANGES.forEach((r) => {
    const label = document.createElement('label');
    label.className = 'recordings-filter-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'recordings-date-range';
    input.value = r.value;
    input.setAttribute('aria-label', r.label);
    if (r.value === 'all') input.checked = true;
    label.append(input, document.createTextNode(` ${r.label}`));
    dateRangeList.append(label);
  });
  dateRangeWrap.append(dateRangeList);

  const tags = getUniqueTags(data);
  const tagWrap = document.createElement('div');
  tagWrap.className = 'recordings-filter-group';
  const tagLabel = document.createElement('span');
  tagLabel.className = 'recordings-filter-label';
  tagLabel.textContent = 'Tag';
  tagWrap.append(tagLabel);
  const tagList = document.createElement('div');
  tagList.className = 'recordings-filter-options';
  tags.forEach((tag) => {
    const label = document.createElement('label');
    label.className = 'recordings-filter-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = tag;
    input.setAttribute('aria-label', tag);
    label.append(input, document.createTextNode(` ${tag}`));
    tagList.append(label);
  });
  tagWrap.append(tagList);

  sidebar.append(searchWrap, sortWrap, dateRangeWrap, tagWrap);

  /* Wire events */
  const applySearch = debounce(() => {
    block.recordingsSearchQuery = search.value;
    updateRecordingsList(block);
  }, 180);
  search.addEventListener('input', () => applySearch());

  sortSelect.addEventListener('change', () => {
    block.recordingsSortBy = sortSelect.value;
    updateRecordingsList(block);
  });

  dateRangeList.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      block.recordingsDateRange = radio.value;
      updateRecordingsList(block);
    });
  });

  tagList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const set = new Set(block.recordingsSelectedTags || []);
      if (cb.checked) set.add(cb.value);
      else set.delete(cb.value);
      block.recordingsSelectedTags = set;
      updateRecordingsList(block);
    });
  });

  return sidebar;
}

/**
 * Renders recordings from EDS sheet data with left sidebar (filters + sort) and list.
 * @param {HTMLElement} block
 * @param {Array} data - Array of { title, speaker, recordingLink, presentationLink, date, tag }
 */
function renderFromSheet(block, data) {
  block.recordingsData = data;
  block.recordingsSearchQuery = '';
  block.recordingsSortBy = 'date-desc';
  block.recordingsDateRange = 'all';
  block.recordingsSelectedTags = new Set();

  block.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'recordings-layout';

  const sidebar = createSidebar(block, data);
  wrapper.append(sidebar);

  const main = document.createElement('div');
  main.className = 'recordings-main';

  const listContainer = document.createElement('ul');
  listContainer.className = 'recordings-list';
  main.append(listContainer);

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'recordings-empty';
  emptyMsg.textContent = 'No recordings match your filters.';
  emptyMsg.hidden = true;
  main.append(emptyMsg);

  wrapper.append(main);
  block.append(wrapper);

  updateRecordingsList(block);
}

/**
 * Decorate recordings block: fetch data from EDS sheet and render. No fallback; block stays empty if fetch fails or returns no data.
 */
export default async function decorate(block) {
  const data = await fetchRecordingsData();
  if (data.length > 0) {
    renderFromSheet(block, data);
  } else {
    block.textContent = '';
  }
}
