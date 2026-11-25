import normalizeSheetRow from '../../utils/sheet.js';

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

/** Normalized tag for filtering: empty string becomes "Other" for display. */
const TAG_OTHER = 'Other';

function getRowTag(row) {
  const t = normalizeField(row.tag);
  return t === '' ? TAG_OTHER : t;
}

/** Collect unique tags from data (including "Other" if any row has no tag). */
function getUniqueTags(data) {
  const set = new Set();
  data.forEach((row) => set.add(getRowTag(row)));
  const list = [...set];
  // eslint-disable-next-line no-nested-ternary -- pre-existing, TECHCOM-104
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
      const title = normalizeField(row.title).toLowerCase();
      const speaker = normalizeField(row.speaker).toLowerCase();
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
  if (title) card.href = `/recordings?${new URLSearchParams({ talk: title })}`;
  card.append(createRecordingsCardIcon());

  const body = document.createElement('div');
  body.className = 'recordings-card-body';

  const speaker = normalizeField(row.speaker);
  const dateStr = formatSheetDate(row.date);
  const tagRaw = normalizeField(row.tag);

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

  if (tagRaw !== '') {
    const tagEl = document.createElement('p');
    tagEl.className = 'recordings-tag';
    tagEl.textContent = tagRaw;
    body.append(tagEl);
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
  const targets = sections.filter((item) => Number(item.tagName[1]) === topLevel);
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

async function renderTalkSummary(article, value) {
  const summary = normalizeField(value);
  if (!summary) return;

  const section = document.createElement('section');
  section.className = 'recordings-detail-summary';
  const heading = document.createElement(article.querySelector('h1') ? 'h2' : 'h3');
  heading.className = 'recordings-summary-title';
  heading.textContent = 'Summary';
  section.append(heading);
  article.append(section);

  try {
    const url = new URL(summary, `${window.location.origin}/`);
    if (url.origin !== window.location.origin) throw new Error('Summary must be a local fragment');
    const path = url.pathname.replace(/(?:\.plain)?\.html$/, '');
    const { loadFragment } = await import('../fragment/fragment.js');
    const fragment = await loadFragment(path);
    if (!fragment) throw new Error('Summary fragment could not be loaded');
    const content = document.createElement('div');
    content.className = 'recordings-summary-content';
    content.tabIndex = 0;
    content.setAttribute('role', 'region');
    content.setAttribute('aria-label', 'Talk summary');
    const headings = [...fragment.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const firstLevel = Math.min(...headings.map((item) => Number(item.tagName[1])));
    const baseLevel = Number(heading.tagName[1]) + 1;
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
    body.className = 'recordings-summary-body';
    body.append(...fragment.childNodes);
    content.append(body);
    section.append(...createSummaryReader(content, heading));
  } catch {
    const message = document.createElement('p');
    message.textContent = 'Summary is currently unavailable.';
    section.append(message);
  }
}

async function renderTalkDetail(block, data, talk) {
  const row = data.find((recording) => normalizeField(recording.title) === talk);
  const article = document.createElement('article');
  article.className = 'recordings-detail';

  const back = document.createElement('a');
  back.href = '/recordings';
  back.className = 'recordings-back';
  back.textContent = 'Back to all recordings';
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

  document.title = `${normalizeField(row.title)} | Recordings`;

  const embedUrl = getRecordingEmbedUrl(row.embedurl);
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
    ['Tag', normalizeField(row.tag)],
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

  const description = normalizeField(row.description);
  if (description) {
    const content = document.createElement('p');
    content.className = 'recordings-detail-description';
    content.textContent = description;
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
    ['Watch recording', embedUrl ? '' : normalizeField(row.recordinglink), 'play'],
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

  if (embedUrl) {
    const stage = document.createElement('div');
    stage.className = 'recordings-detail-stage';
    const video = document.createElement('div');
    video.className = 'recordings-detail-video';
    const player = document.createElement('iframe');
    player.src = embedUrl;
    player.title = `${normalizeField(row.title)} recording`;
    player.width = '800';
    player.height = '450';
    player.allow = 'fullscreen; picture-in-picture';
    player.allowFullscreen = true;
    video.append(player);
    stage.append(video);
    if (details.children.length) stage.append(details);
    surface.append(stage);
  }

  block.replaceChildren(article);
  await renderTalkSummary(surface, row.summary);
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
