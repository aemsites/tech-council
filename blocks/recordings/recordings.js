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

/** EDS sheet path and origin. */
const RECORDINGS_SHEET_PATH = '/forms/recording-form/recordings-data.json?sheet=recordings';
const RECORDINGS_SHEET_ORIGIN = 'https://main--tech-council--aemsites.aem.page';

/**
 * Resolves the recordings sheet URL so that:
 * - On localhost: use relative path so the request goes through the local proxy (aem up), which forwards to EDS with auth and avoids 403.
 * - On EDS host: use same-origin URL.
 * - Otherwise: use full EDS URL (may 403 if server rejects cross-origin).
 */
function getRecordingsSheetUrl() {
  const { origin } = window.location;
  if (origin === RECORDINGS_SHEET_ORIGIN) {
    return `${origin}${RECORDINGS_SHEET_PATH}`;
  }
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    return RECORDINGS_SHEET_PATH;
  }
  return `${RECORDINGS_SHEET_ORIGIN}${RECORDINGS_SHEET_PATH}`;
}

/**
 * Fetches the recordings sheet and returns the "data" array.
 * @returns {Promise<Array>} Array of { title, speaker, recordingLink, presentationLink, date }
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

/** Shared recording icon (play circle) as inline SVG for every card. */
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

/** Get numeric date for sorting (Excel serial or timestamp). */
function getSortDate(row) {
  const v = row.date;
  if (v == null || v === '') return 0;
  const num = Number(v);
  return Number.isNaN(num) ? 0 : num;
}

/** Sort and filter data based on toolbar state. */
function getFilteredAndSortedData(block) {
  const data = block.recordingsData || [];
  const query = (block.recordingsSearchQuery || '').trim().toLowerCase();
  const sortBy = block.recordingsSortBy || 'date-desc';

  let list = query
    ? data.filter((row) => {
      const title = (row.title || '').toLowerCase();
      const speaker = (row.speaker || '').toLowerCase();
      return title.includes(query) || speaker.includes(query);
    })
    : [...data];

  if (sortBy === 'date-desc') {
    list.sort((a, b) => getSortDate(b) - getSortDate(a));
  } else if (sortBy === 'date-asc') {
    list.sort((a, b) => getSortDate(a) - getSortDate(b));
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

  li.append(createRecordingsCardIcon());

  const body = document.createElement('div');
  body.className = 'recordings-card-body';

  const title = row.title ? String(row.title).trim() : '';
  const speaker = row.speaker ? String(row.speaker).trim() : '';
  const dateStr = formatSheetDate(row.date);
  const recordingLink = (row.recordingLink || '').trim();
  const presentationLink = (row.presentationLink || '').trim();

  /* Fixed structure: title → speaker → date → buttons (same order every time for alignment) */
  const titleEl = document.createElement('h3');
  titleEl.className = 'recordings-title';
  titleEl.textContent = title || '';
  if (!title) titleEl.classList.add('is-empty');
  body.append(titleEl);

  const speakerEl = document.createElement('p');
  speakerEl.className = 'recordings-speaker';
  speakerEl.textContent = speaker || '';
  if (!speaker) speakerEl.classList.add('is-empty');
  body.append(speakerEl);

  const dateEl = document.createElement('p');
  dateEl.className = 'recordings-date';
  dateEl.textContent = dateStr || '';
  if (!dateStr) dateEl.classList.add('is-empty');
  body.append(dateEl);

  const btnContainer = document.createElement('div');
  btnContainer.className = 'button-container';
  if (recordingLink) {
    const a = document.createElement('a');
    a.href = recordingLink;
    a.className = 'button';
    a.textContent = 'Watch Recording';
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    btnContainer.append(a);
  }
  if (presentationLink) {
    const a = document.createElement('a');
    a.href = presentationLink;
    a.className = 'button secondary';
    a.textContent = 'Presentation';
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    btnContainer.append(a);
  }
  body.append(btnContainer);
  if (!btnContainer.children.length) btnContainer.classList.add('is-empty');

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

/** Create toolbar (search + sort) and wire events. */
function createToolbar(block) {
  const toolbar = document.createElement('div');
  toolbar.className = 'recordings-toolbar';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'recordings-search-wrap';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'recordings-search';
  search.placeholder = 'Search by title or speaker…';
  search.setAttribute('aria-label', 'Search recordings');
  searchWrap.append(search);

  const sortWrap = document.createElement('div');
  sortWrap.className = 'recordings-sort-wrap';
  const sortLabel = document.createElement('label');
  sortLabel.htmlFor = 'recordings-sort';
  sortLabel.className = 'recordings-sort-label';
  sortLabel.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.id = 'recordings-sort';
  sortSelect.className = 'recordings-sort';
  sortSelect.setAttribute('aria-label', 'Sort recordings');
  [
    { value: 'date-desc', label: 'Newest first' },
    { value: 'date-asc', label: 'Oldest first' },
    { value: 'title-asc', label: 'Title A–Z' },
    { value: 'title-desc', label: 'Title Z–A' },
  ].forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    sortSelect.append(o);
  });
  sortWrap.append(sortLabel, sortSelect);

  toolbar.append(searchWrap, sortWrap);

  search.addEventListener('input', () => {
    block.recordingsSearchQuery = search.value;
    updateRecordingsList(block);
  });
  sortSelect.addEventListener('change', () => {
    block.recordingsSortBy = sortSelect.value;
    updateRecordingsList(block);
  });

  return toolbar;
}

/**
 * Renders recordings from EDS sheet data with toolbar and list.
 * @param {HTMLElement} block
 * @param {Array} data - Array of { title, speaker, recordingLink, presentationLink, date }
 */
function renderFromSheet(block, data) {
  block.recordingsData = data;
  block.recordingsSearchQuery = '';
  block.recordingsSortBy = 'date-desc';

  block.textContent = '';

  const toolbar = createToolbar(block);
  block.append(toolbar);

  const listContainer = document.createElement('ul');
  listContainer.className = 'recordings-list';
  block.append(listContainer);

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'recordings-empty';
  emptyMsg.textContent = 'No recordings match your search.';
  emptyMsg.hidden = true;
  block.append(emptyMsg);

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