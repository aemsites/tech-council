import normalizeSheetRow from '../../utils/sheet.js';
import parseRecordingTime, { getRecordingTime } from '../../utils/recording-time.js';
import { getRecordingCategory, getRecordingTags } from '../../utils/recording-fields.js';
import updatePageMetadata, { canonicalPageUrl, metadataDate, metadataList } from '../../utils/metadata.js';

let playerSequence = 0;

/** A field is considered empty when it's null/undefined, blank, or the number/string 0. */
function isEmptyField(value) {
  if (value == null) return true;
  if (typeof value === 'number') return value === 0;
  const str = String(value).trim();
  return str === '' || str === '0';
}

/** Trims a field to a string, treating 0/"0"/blank as empty (''). */
function normalizeField(value) {
  return isEmptyField(value) ? '' : String(value).trim();
}

/**
 * Converts Excel serial date to a readable date string.
 * @param {string|number} value - Excel serial date (e.g. "46056") or ISO date string
 * @returns {string} Formatted date or original value if not a number
 */
function formatSheetDate(value) {
  if (isEmptyField(value)) return '';
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

function withPlaybackStartTime(value, startTime) {
  if (startTime === null) return value;
  try {
    const url = new URL(value, window.location.origin);
    const allowedHosts = ['adobe.sharepoint.com', 'adobe-my.sharepoint.com'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)
      || url.username || url.password) return value;
    let nav;
    try {
      nav = JSON.parse(url.searchParams.get('nav'));
    } catch {
      nav = null;
    }
    const options = nav && typeof nav === 'object' && !Array.isArray(nav) ? nav : {};
    const playback = options.playbackOptions;
    const playbackOptions = playback && typeof playback === 'object' && !Array.isArray(playback)
      ? playback : {};
    url.searchParams.set('nav', JSON.stringify({
      ...options,
      playbackOptions: { ...playbackOptions, startTimeInSeconds: startTime },
    }));
    return url.href;
  } catch {
    return value;
  }
}

function getRecordingEmbedUrl(value) {
  try {
    const url = new URL(normalizeField(value));
    const allowedHosts = ['adobe.sharepoint.com', 'adobe-my.sharepoint.com'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)
      || url.username || url.password
      || !url.pathname.endsWith('/_layouts/15/embed.aspx')) return '';
    return url.href;
  } catch {
    return '';
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
const RECORDINGS_SHEET_PATH = '/forms/recording-form/recordings.json?sheet=recordings';
const RECORDINGS_SHEET_ORIGIN = 'https://main--tech-council--aemsites.aem.live';

/**
 * Resolves the recordings sheet URL so the request is always same-origin
 * (avoids 403 on production).
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
  /* Use relative path for localhost and any other origin (e.g. production)
     so no cross-origin request */
  return RECORDINGS_SHEET_PATH;
}

/**
 * Fetches the recordings sheet and returns the "data" array.
 * @returns {Promise<Array>} Recording rows with category and comma-separated tags.
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
    return data.map(normalizeSheetRow);
  } catch (e) {
    console.warn('[Recordings] Sheet fetch error:', e?.message || e, url);
    return [];
  }
}

function createRecordingsCardIcon() {
  const wrapper = document.createElement('div');
  wrapper.className = 'recordings-card-icon';
  wrapper.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2" fill="rgba(106, 56, 255, 0.08)"/>
      <path d="M26 22v20l18-10-18-10z" fill="currentColor"/>
    </svg>`;
  return wrapper;
}

/** Likes come from the Tech Council backend; without it (e.g. aem.page) no buttons are shown. */
const LIKES_API = '/api/likes';
const likesState = { enabled: false, counts: {}, liked: new Set() };

async function loadLikes() {
  try {
    const resp = await fetch(`${LIKES_API}?type=recording`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return;
    const json = await resp.json();
    likesState.counts = json.counts && typeof json.counts === 'object' ? json.counts : {};
    likesState.liked = new Set(Array.isArray(json.liked) ? json.liked : []);
    likesState.enabled = true;
  } catch {
    // likes are optional
  }
}

/** Recordings are liked by their recording link, so likes survive title edits. */
function getLikeItem(row) {
  const link = normalizeField(row.recordinglink);
  return link.startsWith('https://') && isSafeUrl(link) ? link : '';
}

function getLikeCount(item) {
  return Object.hasOwn(likesState.counts, item) ? Number(likesState.counts[item]) || 0 : 0;
}

function setLikeState(item, liked, count) {
  likesState.counts[item] = Math.max(0, count);
  if (liked) likesState.liked.add(item);
  else likesState.liked.delete(item);
}

function renderLikeButton(button, item, title) {
  const count = getLikeCount(item);
  button.setAttribute('aria-pressed', String(likesState.liked.has(item)));
  button.setAttribute('aria-label', `Like ${title || 'this recording'}, ${count} ${count === 1 ? 'like' : 'likes'}`);
  button.querySelector('.recordings-like-count').textContent = String(count);
}

function createLikeButton(item, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'recordings-like';
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 10v11"/>
      <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z"/>
    </svg>`;
  const count = document.createElement('span');
  count.className = 'recordings-like-count';
  button.append(count);
  renderLikeButton(button, item, title);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.getAttribute('aria-busy') === 'true') return;
    const wasLiked = likesState.liked.has(item);
    const previousCount = getLikeCount(item);
    setLikeState(item, !wasLiked, previousCount + (wasLiked ? -1 : 1));
    renderLikeButton(button, item, title);
    button.setAttribute('aria-busy', 'true');
    try {
      const resp = await fetch(LIKES_API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ type: 'recording', item, liked: !wasLiked }),
      });
      if (resp.status === 401) {
        setLikeState(item, wasLiked, previousCount);
        const { pathname, search, hash } = window.location;
        window.location.assign(`/api/auth/login?rd=${encodeURIComponent(`${pathname}${search}${hash}`)}`);
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setLikeState(item, json.liked === true, Number(json.count) || 0);
    } catch {
      setLikeState(item, wasLiked, previousCount);
    } finally {
      button.removeAttribute('aria-busy');
      renderLikeButton(button, item, title);
    }
  });
  return button;
}

function createDetailIcon(name) {
  const icon = document.createElement('span');
  icon.className = 'recordings-detail-icon';
  icon.setAttribute('aria-hidden', 'true');
  const paths = {
    back: '<path d="m14 6-6 6 6 6M8 12h12"/>',
    play: '<path d="m9 5 11 7-11 7z"/>',
    slides: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M12 17v4m-4 0h8M7 8h10M7 12h6"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    collapse: '<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/>',
  };
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths[name]}</svg>`;
  return icon;
}

/** Get numeric date for sorting (Excel serial or timestamp). Returns 0 if missing/invalid. */
function getSortDate(row) {
  const v = row.date;
  if (isEmptyField(v)) return 0;
  const num = Number(v);
  return Number.isNaN(num) ? 0 : num;
}

/** Get timestamp (ms) for date-range filtering. Returns null if no valid date. */
function getDateTimestamp(row) {
  const v = row.date;
  if (isEmptyField(v)) return null;
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

const CATEGORY_OTHER = 'Other';
const RECORDINGS_RETURN_KEY = 'recordings-return';

function updateRecordingsUrl(block) {
  const url = new URL(window.location.href);
  ['q', 'sort', 'period', 'category', 'tag'].forEach((key) => url.searchParams.delete(key));
  if (block.recordingsSearchQuery) url.searchParams.set('q', block.recordingsSearchQuery);
  if (block.recordingsSortBy !== 'date-desc') url.searchParams.set('sort', block.recordingsSortBy);
  if (block.recordingsDateRange !== 'all') url.searchParams.set('period', block.recordingsDateRange);
  block.recordingsSelectedCategories.forEach((category) => url.searchParams.append('category', category));
  block.recordingsSelectedTags.forEach((tag) => url.searchParams.append('tag', tag));
  window.history.replaceState(window.history.state, '', url);
}

function getRowCategory(row) {
  return getRecordingCategory(row) || CATEGORY_OTHER;
}

function getUniqueCategories(data) {
  const list = [...new Set(data.map(getRowCategory))];
  list.sort((a, b) => {
    if (a === CATEGORY_OTHER) return 1;
    if (b === CATEGORY_OTHER) return -1;
    return a.localeCompare(b);
  });
  return list;
}

function getUniqueTags(data) {
  return [...new Set(data.flatMap(getRecordingTags))].sort((a, b) => a.localeCompare(b));
}

/** Sort and filter data based on sidebar state. */
function getFilteredAndSortedData(block) {
  const data = block.recordingsData || [];
  const query = (block.recordingsSearchQuery || '').trim().toLowerCase();
  const sortBy = block.recordingsSortBy || 'date-desc';
  const dateRange = block.recordingsDateRange || 'all';
  const selectedCategories = block.recordingsSelectedCategories || new Set();
  const selectedTags = block.recordingsSelectedTags || new Set();

  let list = [...data];

  /* Text search includes both classification fields. */
  if (query) {
    list = list.filter((row) => {
      const title = normalizeField(row.title).toLowerCase();
      const speaker = normalizeField(row.speaker).toLowerCase();
      return [title, speaker, getRecordingCategory(row), ...getRecordingTags(row)]
        .some((value) => value.toLowerCase().includes(query));
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

  if (selectedCategories.size > 0) {
    list = list.filter((row) => selectedCategories.has(getRowCategory(row)));
  }

  if (selectedTags.size > 0) {
    list = list.filter((row) => getRecordingTags(row).some((tag) => selectedTags.has(tag)));
  }

  /* Sort: by date (items with date first, then no-date at end) or by title */
  if (sortBy === 'date-desc') {
    list.sort((a, b) => {
      const da = getSortDate(a);
      const db = getSortDate(b);
      if (da !== db) return db - da; /* higher date first; 0 (no date) goes to end */
      return normalizeField(a.title).localeCompare(normalizeField(b.title), undefined, { sensitivity: 'base' });
    });
  } else if (sortBy === 'date-asc') {
    list.sort((a, b) => {
      const da = getSortDate(a);
      const db = getSortDate(b);
      if (da !== db) return da - db; /* lower date first; 0 (no date) goes to end */
      return normalizeField(a.title).localeCompare(normalizeField(b.title), undefined, { sensitivity: 'base' });
    });
  } else if (sortBy === 'title-asc') {
    list.sort((a, b) => normalizeField(a.title).localeCompare(normalizeField(b.title), undefined, { sensitivity: 'base' }));
  } else if (sortBy === 'title-desc') {
    list.sort((a, b) => normalizeField(b.title).localeCompare(normalizeField(a.title), undefined, { sensitivity: 'base' }));
  }

  return list;
}

const NEW_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** True when the row's date falls within the last 14 days. */
function isRecentRecording(row) {
  const ts = getDateTimestamp(row);
  return ts != null && ts >= Date.now() - NEW_BADGE_WINDOW_MS;
}

/** Build one list item DOM for a row. */
function buildRecordingsCard(row, rowIdx) {
  const li = document.createElement('li');
  li.style.setProperty('--i', String(rowIdx));

  const title = normalizeField(row.title);
  const card = document.createElement(title ? 'a' : 'div');
  card.className = 'recordings-card-link';
  if (title) {
    const url = new URL(window.location.href);
    url.pathname = '/recordings';
    url.searchParams.set('talk', title);
    url.hash = '';
    card.href = url.href;
  }
  card.append(createRecordingsCardIcon());

  const body = document.createElement('div');
  body.className = 'recordings-card-body';

  const speaker = normalizeField(row.speaker);
  const dateStr = formatSheetDate(row.date);
  const category = getRecordingCategory(row);

  const titleEl = document.createElement('h3');
  titleEl.className = 'recordings-title';
  titleEl.textContent = title;
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

  if (category) {
    const categoryEl = document.createElement('p');
    categoryEl.className = 'recordings-category';
    categoryEl.textContent = category;
    body.append(categoryEl);
  }
  const tags = getRecordingTags(row);
  if (tags.length) {
    const tagList = document.createElement('p');
    tagList.className = 'recordings-tags';
    tagList.setAttribute('aria-label', 'Tags');
    tags.forEach((tag) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'recordings-tag';
      tagEl.textContent = tag;
      tagList.append(tagEl);
    });
    body.append(tagList);
  }

  card.append(body);
  li.append(card);

  const likeItem = getLikeItem(row);
  if (likesState.enabled && likeItem) {
    li.classList.add('has-like');
    li.append(createLikeButton(likeItem, title));
  }

  if (isRecentRecording(row)) {
    const newBadge = document.createElement('span');
    newBadge.className = 'recordings-card-badge-new';
    newBadge.textContent = 'New';
    li.classList.add('has-new-badge');
    card.append(newBadge);
  }

  return li;
}

/** Re-render only the list (ul) from current filter/sort. */
function updateRecordingsList(block) {
  const listContainer = block.querySelector('.recordings-list');
  const emptyEl = block.querySelector('.recordings-empty');
  if (!listContainer) return;

  updateRecordingsUrl(block);
  const rows = getFilteredAndSortedData(block);
  const filterToggle = block.querySelector('.recordings-advanced-filters > summary');
  const activeFilters = block.recordingsSelectedTags.size + block.recordingsSelectedCategories.size
    + Number(block.recordingsDateRange !== 'all') + Number(block.recordingsSortBy !== 'date-desc');
  if (filterToggle) filterToggle.textContent = activeFilters ? `Filters (${activeFilters})` : 'Filters';
  const status = block.querySelector('.recordings-status');
  if (status) status.textContent = `${rows.length} of ${block.recordingsData.length} recordings`;
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
  search.placeholder = 'Title, speaker, category or tag…';
  search.setAttribute('aria-label', 'Search recordings');
  search.value = block.recordingsSearchQuery;
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
  sortSelect.value = block.recordingsSortBy;
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
    input.checked = r.value === block.recordingsDateRange;
    label.append(input, document.createTextNode(` ${r.label}`));
    dateRangeList.append(label);
  });
  dateRangeWrap.append(dateRangeList);

  const createClassificationFilter = (title, values, stateKey, name) => {
    const group = document.createElement('fieldset');
    group.className = 'recordings-filter-group';
    const legend = document.createElement('legend');
    legend.className = 'recordings-filter-label';
    legend.textContent = title;
    const options = document.createElement('div');
    options.className = `recordings-filter-options recordings-${name}-options`;
    values.forEach((value) => {
      const label = document.createElement('label');
      label.className = 'recordings-filter-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.value = value;
      input.checked = block[stateKey].has(value);
      input.addEventListener('change', () => {
        if (input.checked) block[stateKey].add(value);
        else block[stateKey].delete(value);
        updateRecordingsList(block);
      });
      label.append(input, document.createTextNode(` ${value}`));
      options.append(label);
    });
    group.append(legend, options);
    return group;
  };
  const categoryWrap = createClassificationFilter('Category', getUniqueCategories(data), 'recordingsSelectedCategories', 'category');
  const tagWrap = createClassificationFilter('Tags', getUniqueTags(data), 'recordingsSelectedTags', 'tag');

  const advanced = document.createElement('details');
  advanced.className = 'recordings-advanced-filters';
  const toggle = document.createElement('summary');
  toggle.textContent = 'Filters';
  const filters = document.createElement('div');
  filters.className = 'recordings-advanced-filter-fields';
  filters.append(sortWrap, dateRangeWrap, categoryWrap, tagWrap);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'recordings-clear-filters';
  clear.textContent = 'Clear filters';
  clear.addEventListener('click', () => {
    block.recordingsSearchQuery = '';
    block.recordingsSortBy = 'date-desc';
    block.recordingsDateRange = 'all';
    block.recordingsSelectedCategories = new Set();
    block.recordingsSelectedTags = new Set();
    search.value = '';
    sortSelect.value = 'date-desc';
    dateRangeList.querySelectorAll('input').forEach((input) => {
      input.checked = input.value === 'all';
    });
    [categoryWrap, tagWrap].forEach((group) => {
      group.querySelectorAll('input').forEach((input) => { input.checked = false; });
    });
    updateRecordingsList(block);
    search.focus();
  });
  filters.append(clear);
  advanced.append(toggle, filters);
  const mobile = window.matchMedia('(width <= 768px)');
  const updateLayout = () => { advanced.open = !mobile.matches; };
  updateLayout();
  mobile.addEventListener('change', updateLayout);
  block.recordingsLayoutCleanup?.();
  block.recordingsLayoutCleanup = () => mobile.removeEventListener('change', updateLayout);
  sidebar.append(searchWrap, advanced);

  /* Wire events */
  const applySearch = debounce(() => {
    block.recordingsSearchQuery = search.value.trim();
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

  return sidebar;
}

/**
 * Renders recordings from EDS sheet data with left sidebar (filters + sort) and list.
 * @param {HTMLElement} block
 * @param {Array} data - Recording rows with category and comma-separated tags.
 */
function renderFromSheet(block, data) {
  const params = new URLSearchParams(window.location.search);
  block.recordingsData = data;
  block.recordingsSearchQuery = params.get('q')?.trim() || '';
  const sort = params.get('sort');
  block.recordingsSortBy = ['date-desc', 'date-asc', 'title-asc', 'title-desc'].includes(sort)
    ? sort : 'date-desc';
  const period = params.get('period');
  block.recordingsDateRange = DATE_RANGES.some((range) => range.value === period) ? period : 'all';
  const tags = getUniqueTags(data);
  const categories = getUniqueCategories(data);
  const legacyCategories = params.getAll('tag')
    .filter((value) => !tags.includes(value) && categories.includes(value));
  block.recordingsSelectedCategories = new Set(
    [...params.getAll('category'), ...legacyCategories].filter((value) => categories.includes(value)),
  );
  block.recordingsSelectedTags = new Set(params.getAll('tag').filter((tag) => tags.includes(tag)));

  block.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'recordings-layout';

  const sidebar = createSidebar(block, data);
  wrapper.append(sidebar);

  const main = document.createElement('div');
  main.className = 'recordings-main';
  const status = document.createElement('p');
  status.className = 'recordings-status';
  status.setAttribute('role', 'status');
  main.append(status);

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
  listContainer.addEventListener('click', (event) => {
    if (!event.target.closest('a.recordings-card-link') || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      window.sessionStorage.setItem(RECORDINGS_RETURN_KEY, JSON.stringify({
        url: window.location.href,
        scroll: window.scrollY,
      }));
    } catch {
      // Filter URLs still work when session storage is unavailable.
    }
  });
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(RECORDINGS_RETURN_KEY));
    if (saved?.url === window.location.href && Number.isFinite(saved.scroll)) {
      window.sessionStorage.removeItem(RECORDINGS_RETURN_KEY);
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.scroll)));
    }
  } catch {
    // Scroll restoration is optional.
  }
}

function createSummaryReader(content, heading) {
  const slot = document.createElement('div');
  slot.className = 'recordings-summary-slot';
  const reader = document.createElement('div');
  reader.className = 'recordings-summary-reader';
  const toolbar = document.createElement('div');
  toolbar.className = 'recordings-summary-toolbar';
  const title = document.createElement('div');
  title.className = 'recordings-summary-caption';
  const metadata = document.createElement('span');
  metadata.className = 'recordings-summary-meta';
  const wordCount = content.textContent.trim().split(/\s+/).filter(Boolean).length;
  metadata.textContent = `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
  title.append(heading, metadata);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'recordings-summary-toggle';
  const progress = document.createElement('progress');
  progress.className = 'recordings-summary-progress';
  progress.max = 100;
  progress.value = 0;
  progress.setAttribute('aria-label', 'Summary reading progress');
  const dialog = document.createElement('dialog');
  dialog.className = 'recordings-summary-dialog';
  dialog.setAttribute('aria-label', 'Full-screen talk summary');
  let scrollPosition = 0;
  const stage = document.createElement('div');
  stage.className = 'recordings-summary-stage';
  const sections = [...content.querySelectorAll('h3, h4, h5, h6')];
  const topLevel = Math.min(...sections.map((item) => Number(item.tagName[1])));
  const targets = sections.filter((item) => Number(item.tagName[1]) === topLevel
    || item.closest('.talk-block-topic'));
  const outline = document.createElement('nav');
  outline.className = 'recordings-summary-outline';
  outline.setAttribute('aria-label', 'Summary sections');
  const outlineTitle = document.createElement('p');
  outlineTitle.textContent = 'In this summary';
  outline.append(outlineTitle);
  const jump = document.createElement('select');
  jump.className = 'recordings-summary-jump';
  jump.setAttribute('aria-label', 'Jump to summary section');
  const links = targets.map((target, index) => {
    if (!target.id) {
      let suffix = index + 1;
      while (document.getElementById(`summary-section-${suffix}`)
        || content.querySelector(`#summary-section-${suffix}`)) suffix += 1;
      target.id = `summary-section-${suffix}`;
    }
    target.tabIndex = -1;
    const link = document.createElement('a');
    link.href = `#${encodeURIComponent(target.id)}`;
    link.textContent = target.textContent;
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = target.textContent;
    jump.append(option);
    outline.append(link);
    return link;
  });
  let activeSection = -1;

  const goToSection = (index) => {
    const target = targets[index];
    content.scrollTop += target.getBoundingClientRect().top
      - content.getBoundingClientRect().top - 24;
    target.focus({ preventScroll: true });
  };
  links.forEach((link, index) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      goToSection(index);
    });
  });
  jump.addEventListener('change', () => goToSection(Number(jump.value)));

  const updateToggle = (expanded) => {
    const label = expanded ? 'Exit full screen' : 'Read full screen';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.replaceChildren(createDetailIcon(expanded ? 'collapse' : 'expand'));
    if (expanded) toggle.removeAttribute('aria-haspopup');
    else toggle.setAttribute('aria-haspopup', 'dialog');
  };
  const updateProgress = () => {
    if (!content.clientHeight) return;
    scrollPosition = content.scrollTop;
    const remaining = content.scrollHeight - content.clientHeight;
    const percent = remaining > 1
      ? Math.min(100, Math.max(0, Math.round((content.scrollTop / remaining) * 100))) : 100;
    progress.value = percent;
    progress.hidden = remaining <= 1;
    const top = content.getBoundingClientRect().top + 48;
    let current = 0;
    targets.forEach((target, index) => {
      if (target.getBoundingClientRect().top <= top) current = index;
    });
    if (remaining > 1 && content.scrollTop >= remaining - 2) current = targets.length - 1;
    if (current !== activeSection) {
      activeSection = current;
      links.forEach((link, index) => {
        if (index === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      jump.value = String(current);
      if (links[current] && outline.clientHeight) {
        const bounds = outline.getBoundingClientRect();
        const active = links[current].getBoundingClientRect();
        if (active.top < bounds.top) outline.scrollTop += active.top - bounds.top;
        else if (active.bottom > bounds.bottom) outline.scrollTop += active.bottom - bounds.bottom;
      }
    }
  };

  toggle.addEventListener('click', () => {
    if (dialog.open) {
      updateProgress();
      dialog.close();
      return;
    }
    const { scrollTop } = content;
    slot.style.height = `${slot.offsetHeight}px`;
    dialog.append(reader);
    updateToggle(true);
    dialog.showModal();
    content.scrollTop = scrollTop;
    updateProgress();
  });
  dialog.addEventListener('cancel', updateProgress);
  dialog.addEventListener('close', () => {
    const scrollTop = scrollPosition;
    slot.append(reader);
    slot.style.height = '';
    updateToggle(false);
    content.scrollTop = scrollTop;
    updateProgress();
    // The invoker moves with the reader, so restore focus after returning it to the page.
    toggle.focus({ preventScroll: true });
  });
  content.addEventListener('scroll', updateProgress, { passive: true });
  const observer = new ResizeObserver(updateProgress);
  observer.observe(content);
  observer.observe(content.firstElementChild);
  updateToggle(false);
  toolbar.append(title, toggle);
  if (targets.length > 1) {
    stage.append(outline);
    reader.append(toolbar, progress, jump, stage);
  } else {
    reader.append(toolbar, progress, stage);
  }
  stage.append(content);
  slot.append(reader);
  return [slot, dialog];
}

function linkTranscriptTimestamps(content, title, prefix) {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement.closest('a, code, pre, script, style')) nodes.push(node);
  }
  let count = 0;
  nodes.forEach((node) => {
    const matches = [...node.textContent.matchAll(/(?<![\d:])\b\d+(?::[0-5]\d){1,2}\b(?![\d:])/g)];
    if (!matches.length) return;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    matches.forEach((match) => {
      const [timestamp] = match;
      const seconds = parseRecordingTime(timestamp);
      if (seconds === null) return;
      fragment.append(document.createTextNode(node.textContent.slice(offset, match.index)));
      const link = document.createElement('a');
      link.className = 'recordings-transcript-timestamp';
      link.id = `${prefix}-moment-${count += 1}`;
      link.href = `/recordings?${new URLSearchParams({ talk: title, t: String(seconds) })}`;
      link.textContent = timestamp;
      link.setAttribute('aria-label', `Watch ${title} at ${timestamp}`);
      const moment = document.createElement('span');
      moment.className = 'recordings-transcript-moment';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'recordings-transcript-copy';
      copy.setAttribute('aria-label', `Copy link to moment ${timestamp}`);
      copy.setAttribute('command', '--copy-recording-link');
      copy.setAttribute('commandfor', link.id);
      copy.append(createDetailIcon('copy'));
      moment.append(link, copy);
      fragment.append(moment);
      offset = match.index + timestamp.length;
    });
    fragment.append(document.createTextNode(node.textContent.slice(offset)));
    node.replaceWith(fragment);
  });
}

function createTranscriptTools(content, title) {
  const prefix = `recordings-transcript-${recordingsBlockCount += 1}`;
  linkTranscriptTimestamps(content, title, prefix);
  const toolbar = document.createElement('div');
  toolbar.className = 'recordings-transcript-tools';
  const label = document.createElement('label');
  label.htmlFor = `${prefix}-search`;
  label.textContent = 'Search transcript';
  const search = document.createElement('input');
  search.id = label.htmlFor;
  search.type = 'search';
  search.maxLength = 200;
  search.placeholder = 'Find a word or phrase…';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.textContent = 'Previous';
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';
  const matchesStatus = document.createElement('span');
  matchesStatus.className = 'recordings-transcript-match-status';
  matchesStatus.setAttribute('role', 'status');
  const copyStatus = document.createElement('span');
  copyStatus.className = 'recordings-transcript-copy-status';
  copyStatus.setAttribute('role', 'status');
  const copyFallback = document.createElement('input');
  copyFallback.type = 'text';
  copyFallback.readOnly = true;
  copyFallback.hidden = true;
  copyFallback.setAttribute('aria-label', 'Recording moment link to copy');
  toolbar.append(label, search, previous, next, matchesStatus, copyStatus, copyFallback);

  const nativeHighlights = !!(window.CSS?.highlights && window.Highlight);
  const highlightName = 'recordings-transcript-matches';
  const readNodes = () => {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement.closest('button, script, style')) nodes.push(node);
    }
    return nodes;
  };
  let nodes = readNodes();
  let ranges = [];
  let current = -1;
  let appliedQuery = null;
  const updateSearch = () => {
    const query = search.value.trim();
    if (query === appliedQuery) return;
    appliedQuery = query;
    if (nativeHighlights) CSS.highlights.delete(highlightName);
    else {
      content.querySelectorAll('mark.recordings-transcript-match').forEach((mark) => {
        mark.replaceWith(...mark.childNodes);
      });
      content.normalize();
      nodes = readNodes();
    }
    ranges = [];
    current = -1;
    if (query) {
      const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
      let text = '';
      let previousBlock;
      const segments = nodes.map((node) => {
        const block = node.parentElement.closest('p, li, h1, h2, h3, h4, h5, h6');
        if (previousBlock && block !== previousBlock) text += '\n';
        previousBlock = block;
        const start = text.length;
        text += node.textContent;
        return { node, start, end: text.length };
      });
      const matches = [...text.matchAll(pattern)];
      if (nativeHighlights) {
        matches.forEach((match) => {
          const start = segments.find((segment) => segment.end > match.index);
          const endIndex = match.index + match[0].length;
          const end = segments.find((segment) => segment.end >= endIndex);
          const range = document.createRange();
          range.setStart(start.node, match.index - start.start);
          range.setEnd(end.node, endIndex - end.start);
          ranges.push(range);
        });
      } else {
        const marks = matches.map(() => []);
        segments.forEach((segment) => {
          const fragment = document.createDocumentFragment();
          let offset = 0;
          matches.forEach((match, index) => {
            const start = Math.max(segment.start, match.index) - segment.start;
            const end = Math.min(segment.end, match.index + match[0].length) - segment.start;
            if (end <= start) return;
            fragment.append(document.createTextNode(segment.node.textContent.slice(offset, start)));
            const mark = document.createElement('mark');
            mark.className = 'recordings-transcript-match';
            mark.textContent = segment.node.textContent.slice(start, end);
            fragment.append(mark);
            marks[index].push(mark);
            offset = end;
          });
          if (offset) {
            fragment.append(document.createTextNode(segment.node.textContent.slice(offset)));
            segment.node.replaceWith(fragment);
          }
        });
        marks.forEach((parts) => {
          const first = parts[0];
          const last = parts[parts.length - 1];
          const range = document.createRange();
          range.setStart(first.firstChild, 0);
          range.setEnd(last.firstChild, last.textContent.length);
          ranges.push(range);
        });
      }
      if (nativeHighlights && ranges.length) {
        const highlight = new window.Highlight(...ranges);
        CSS.highlights.set(highlightName, highlight);
      }
    }
    previous.disabled = !ranges.length;
    next.disabled = !ranges.length;
    matchesStatus.textContent = query ? `${ranges.length} matches` : '';
  };
  const goToMatch = (direction) => {
    if (!ranges.length) return;
    if (current < 0) current = direction > 0 ? 0 : ranges.length - 1;
    else current = (current + direction + ranges.length) % ranges.length;
    ranges[current].startContainer.parentElement.scrollIntoView({ block: 'center' });
    matchesStatus.textContent = `Match ${current + 1} of ${ranges.length}`;
  };
  search.addEventListener('input', debounce(updateSearch, 180));
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    updateSearch();
    goToMatch(event.shiftKey ? -1 : 1);
  });
  previous.addEventListener('click', () => goToMatch(-1));
  next.addEventListener('click', () => goToMatch(1));
  updateSearch();

  let lastCopyMessage = '';
  const reportCopy = (message) => {
    copyStatus.textContent = message === lastCopyMessage ? `${message}\u00a0` : message;
    lastCopyMessage = copyStatus.textContent;
  };
  const copyLink = async (target) => {
    if (!target?.matches('.recordings-transcript-timestamp')) return;
    copyStatus.textContent = '';
    copyFallback.hidden = true;
    try {
      await navigator.clipboard.writeText(target.href);
      reportCopy('Moment link copied.');
    } catch {
      reportCopy('Could not copy. Select and copy the link below.');
      copyFallback.value = target.href;
      copyFallback.hidden = false;
      copyFallback.focus();
      copyFallback.select();
    }
  };
  if ('CommandEvent' in window) {
    content.addEventListener('command', (event) => {
      if (event.command === '--copy-recording-link') copyLink(event.target);
    }, true);
  } else {
    content.addEventListener('click', (event) => {
      const copy = event.target.closest('.recordings-transcript-copy');
      if (copy) copyLink(document.getElementById(copy.getAttribute('commandfor')));
    });
  }
  return toolbar;
}

async function renderTalkContent(article, value, type = 'summary') {
  const pathValue = normalizeField(value);
  if (!pathValue) return null;
  const isTranscript = type === 'transcript';
  const label = isTranscript ? 'Transcript' : 'Summary';
  const headingLevel = article.querySelector('h1') ? 2 : 3;

  const section = document.createElement(isTranscript ? 'details' : 'section');
  section.className = `recordings-detail-${type}`;
  section.hidden = isTranscript;
  const heading = document.createElement(isTranscript ? 'summary' : `h${headingLevel}`);
  heading.className = isTranscript ? 'recordings-transcript-toggle' : 'recordings-summary-title';
  heading.textContent = isTranscript ? 'Full transcript' : label;
  section.append(heading);
  article.append(section);
  const loading = document.createElement('p');
  loading.setAttribute('role', 'status');
  loading.textContent = `Loading ${label.toLowerCase()}…`;
  section.append(loading);

  try {
    const url = new URL(pathValue, `${window.location.origin}/`);
    if (url.origin !== window.location.origin) throw new Error(`${label} must be a local fragment`);
    const path = url.pathname.replace(/(?:\.plain)?\.html$/, '');
    const { loadFragment } = await import('../fragment/fragment.js');
    const fragment = await loadFragment(path, { signal: AbortSignal.timeout(10000) });
    if (!fragment || (isTranscript && !fragment.textContent.trim())) {
      throw new Error(`${label} fragment could not be loaded`);
    }
    const content = document.createElement('div');
    content.className = `recordings-${type}-content`;
    if (!isTranscript) {
      content.tabIndex = 0;
      content.setAttribute('role', 'region');
      content.setAttribute('aria-label', 'Talk summary');
    }
    const headings = [...fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const firstLevel = Math.min(...headings.map((item) => Number(item.tagName[1])));
    const baseLevel = isTranscript ? headingLevel : headingLevel + 1;
    headings.forEach((item) => {
      const level = Math.min(6, baseLevel + Number(item.tagName[1]) - firstLevel);
      const replacement = document.createElement(`h${level}`);
      [...item.attributes].forEach(({ name, value: attributeValue }) => {
        replacement.setAttribute(name, attributeValue);
      });
      replacement.append(...item.childNodes);
      item.replaceWith(replacement);
    });
    const body = document.createElement('div');
    body.className = `recordings-${type}-body`;
    body.append(...fragment.childNodes);
    content.append(body);
    loading.remove();
    if (isTranscript) {
      section.append(createTranscriptTools(
        content,
        article.querySelector('.recordings-detail-title').textContent,
      ));
      section.append(content);
      section.hidden = false;
    } else section.append(...createSummaryReader(content, heading));
  } catch {
    if (isTranscript) {
      section.remove();
      return null;
    }
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = `${label} is currently unavailable.`;
    loading.remove();
    section.append(message);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'recordings-content-retry';
    retry.textContent = `Retry ${label.toLowerCase()}`;
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      message.textContent = `Loading ${label.toLowerCase()}…`;
      const replacement = await renderTalkContent(article, value, type);
      section.replaceWith(replacement);
      replacement.querySelector('button')?.focus();
    });
    section.append(retry);
  }
  return section;
}

async function renderTalkDetail(block, data, talk) {
  const row = data.find((recording) => normalizeField(recording.title) === talk);
  const article = document.createElement('article');
  article.className = 'recordings-detail';

  const back = document.createElement('a');
  const returnUrl = new URL(window.location.href);
  returnUrl.pathname = '/recordings';
  ['talk', 't'].forEach((key) => returnUrl.searchParams.delete(key));
  returnUrl.hash = '';
  back.href = returnUrl.href;
  back.className = 'recordings-back';
  back.textContent = 'Back to recordings';
  back.prepend(createDetailIcon('back'));
  article.append(back);

  const surface = document.createElement('div');
  surface.className = 'recordings-detail-surface';
  const header = document.createElement('div');
  header.className = 'recordings-detail-header';
  const intro = document.createElement('div');
  intro.className = 'recordings-detail-intro';
  const heading = document.createElement(document.querySelector('main h1') ? 'h2' : 'h1');
  heading.className = 'recordings-detail-title';
  heading.textContent = row ? normalizeField(row.title) : 'Talk not found';
  intro.append(heading);
  header.append(intro);
  surface.append(header);
  article.append(surface);

  if (!row) {
    const message = document.createElement('p');
    message.textContent = 'This talk could not be found. Browse all recordings to find another talk.';
    intro.append(message);
    block.replaceChildren(article);
    return;
  }

  const title = normalizeField(row.title);
  const speaker = normalizeField(row.speaker);
  const talkDescription = normalizeField(row.description);
  const pageTitle = `${title} | Recordings`;
  const pageDescription = talkDescription
    || `Watch the Tech Council recording of ${title}${speaker ? ` by ${speaker}` : ''}.`;
  const canonical = new URL('/recordings', window.location.origin);
  canonical.searchParams.set('talk', title);
  const canonicalUrl = canonicalPageUrl(canonical);
  const category = getRecordingCategory(row);
  const tags = getRecordingTags(row);
  const speakers = metadataList(speaker);
  const recordingDate = metadataDate(row.date, true);
  const baseEmbedUrl = getRecordingEmbedUrl(row.embedurl);
  const videoSchema = {
    '@type': 'VideoObject',
    '@id': `${canonicalUrl}#video`,
    name: title,
    description: pageDescription,
    url: canonicalUrl,
    inLanguage: document.documentElement.lang || 'en',
    mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` },
  };
  if (baseEmbedUrl) {
    videoSchema.embedUrl = baseEmbedUrl;
    videoSchema.potentialAction = {
      '@type': 'SeekToAction',
      target: `${canonicalUrl}&t={seek_to_second_number}`,
      'startOffset-input': 'required name=seek_to_second_number',
    };
  }
  if (recordingDate) videoSchema.dateCreated = recordingDate;
  if (category) videoSchema.genre = category;
  if (tags.length) videoSchema.keywords = tags;
  if (speakers.length) videoSchema.contributor = speakers.map((name) => ({ '@type': 'Person', name }));
  updatePageMetadata({
    title: pageTitle,
    description: pageDescription,
    canonical: canonicalUrl,
    speakers,
    category,
    tags,
    keywords: [title, category, ...tags, ...speakers],
    recordingDate,
    contentType: 'recording',
    ogType: 'video.other',
    pageType: 'WebPage',
    entity: videoSchema,
  });

  const startTime = getRecordingTime(new URL(window.location.href));
  const embedUrl = withPlaybackStartTime(baseEmbedUrl, startTime);
  const details = embedUrl ? document.createElement('div') : intro;
  if (embedUrl) {
    article.classList.add('recordings-detail-embedded');
    details.className = 'recordings-detail-sidebar';
  }

  const metadata = document.createElement('dl');
  metadata.className = 'recordings-detail-metadata';
  [
    ['Speaker', normalizeField(row.speaker)],
    ['Date', formatSheetDate(row.date)],
    ['Category', category],
    ['Tags', tags.join(', ')],
  ].forEach(([label, value]) => {
    if (!value) return;
    const item = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    item.append(term, description);
    metadata.append(item);
  });
  if (metadata.children.length) details.append(metadata);

  const likeItem = getLikeItem(row);
  if (likesState.enabled && likeItem) {
    details.append(createLikeButton(likeItem, normalizeField(row.title)));
  }

  if (talkDescription) {
    const content = document.createElement('p');
    content.className = 'recordings-detail-description';
    content.textContent = talkDescription;
    intro.append(content);
  }

  const resources = document.createElement('aside');
  resources.className = 'recordings-detail-resources';
  resources.setAttribute('aria-label', 'Talk resources');
  const resourcesHeading = document.createElement(heading.tagName === 'H1' ? 'h2' : 'h3');
  resourcesHeading.textContent = 'Talk resources';
  const actions = document.createElement('div');
  actions.className = 'recordings-detail-actions';
  [
    ['Watch recording', withPlaybackStartTime(normalizeField(row.recordinglink), startTime), 'play'],
    ['View presentation', normalizeField(row.presentationlink), 'slides'],
  ].forEach(([label, url, icon]) => {
    if (!isSafeUrl(url)) return;
    const link = document.createElement('a');
    link.href = url;
    link.className = `button${icon === 'slides' ? ' secondary' : ''}`;
    link.textContent = label;
    link.prepend(createDetailIcon(icon));
    link.target = '_blank';
    link.rel = 'noopener';
    actions.append(link);
  });
  if (actions.children.length) {
    const note = document.createElement('p');
    note.className = 'recordings-detail-resource-note';
    note.textContent = 'Links open in a new tab.';
    resources.append(resourcesHeading, actions, note);
    if (embedUrl) details.append(resources);
    else header.append(resources);
  }

  const player = embedUrl ? document.createElement('iframe') : null;
  if (embedUrl) {
    const stage = document.createElement('div');
    stage.className = 'recordings-detail-stage';
    const video = document.createElement('div');
    video.className = 'recordings-detail-video';
    player.src = embedUrl;
    player.title = `${normalizeField(row.title)} recording`;
    player.width = '800';
    player.height = '450';
    player.allow = 'fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    const help = document.createElement('aside');
    help.className = 'recordings-player-help';
    help.setAttribute('aria-label', 'Recording sign-in help');
    const helpText = document.createElement('p');
    const helpTitle = document.createElement('strong');
    helpTitle.textContent = 'Trouble playing?';
    helpText.append(helpTitle, document.createTextNode(
      'Open SharePoint in a new tab, then reload. Use the same browser or private window.',
    ));
    const helpActions = document.createElement('div');
    helpActions.className = 'recordings-player-help-actions';
    const playerFrame = document.createElement('div');
    playerSequence += 1;
    playerFrame.id = `recordings-embedded-player-${playerSequence}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'button secondary recordings-player-toggle';
    toggle.textContent = 'Hide player';
    toggle.setAttribute('aria-controls', playerFrame.id);
    toggle.setAttribute('aria-expanded', 'true');
    const setPlayerVisible = (visible) => {
      playerFrame.hidden = !visible;
      if (visible && !player.parentElement) playerFrame.append(player);
      else if (!visible) player.remove();
      toggle.textContent = visible ? 'Hide player' : 'Show player';
      toggle.setAttribute('aria-expanded', String(visible));
    };
    toggle.addEventListener('click', () => setPlayerVisible(playerFrame.hidden));
    const signIn = document.createElement('a');
    signIn.className = 'button recordings-player-sign-in';
    signIn.href = embedUrl;
    signIn.textContent = 'Sign in';
    signIn.setAttribute('aria-label', 'Sign in to SharePoint');
    signIn.target = '_blank';
    signIn.rel = 'noopener';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'button secondary';
    reload.textContent = 'Reload player';
    reload.addEventListener('click', () => {
      player.setAttribute('src', player.src);
      setPlayerVisible(true);
    });
    helpActions.append(signIn, reload, toggle);
    help.append(helpText, helpActions);
    playerFrame.append(player);
    video.append(help, playerFrame);
    stage.append(video);
    if (details.children.length) stage.append(details);
    surface.append(stage);
  }

  block.replaceChildren(article);
  article.addEventListener('click', (event) => {
    const link = event.target.closest('.recordings-transcript-timestamp');
    if (!link || !player || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const time = new URL(link.href).searchParams.get('t');
    const seconds = parseRecordingTime(time);
    if (seconds === null) return;
    player.src = withPlaybackStartTime(getRecordingEmbedUrl(row.embedurl), seconds);
    if (!player.parentElement) article.querySelector('.recordings-player-toggle').click();
    article.querySelector('.recordings-player-sign-in').href = player.src;
    const watch = article.querySelector('.recordings-detail-actions .button:not(.secondary)');
    if (watch) watch.href = withPlaybackStartTime(normalizeField(row.recordinglink), seconds);
    const url = new URL(window.location.href);
    url.searchParams.set('t', time);
    if (url.hash.startsWith('#t=')) url.hash = '';
    window.history.replaceState(null, '', url);
  });
  await Promise.all([
    renderTalkContent(surface, row.summary),
    renderTalkContent(surface, row.transcript, 'transcript'),
  ]);
}

/**
 * Fetch the recordings sheet and render the listing or a query-selected talk.
 */
export default async function decorate(block) {
  const [data] = await Promise.all([fetchRecordingsData(), loadLikes()]);
  const talk = new URLSearchParams(window.location.search).get('talk')?.trim();
  if (talk) {
    await renderTalkDetail(block, data, talk);
  } else if (data.length > 0) {
    renderFromSheet(block, data);
  } else {
    block.textContent = '';
  }
}
