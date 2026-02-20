function toRelativeUrl(input) {
  if (!input) return '';

  try {
    const parsed = new URL(input, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return input;
  }
}

function normalizeKey(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function resolveCommunityRecords(records, queryName) {
  if (!records.length) return [];
  if (!queryName) return records;

  const normalizedQuery = normalizeKey(queryName);
  return records.filter((entry) => {
    const key = normalizeKey(entry.name);
    return key === normalizedQuery
      || key.startsWith(normalizedQuery)
      || normalizedQuery.startsWith(key);
  });
}

function formatSheetDate(value) {
  if (value == null || value === '') return '';
  const num = Number(value);
  if (!Number.isNaN(num)) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsed);
  }
  return String(value);
}

function createRecordingCard(record) {
  const card = document.createElement('article');
  card.className = 'comd-recordings-card';

  const top = document.createElement('div');
  top.className = 'comd-recordings-card-top';
  top.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M10 8v8l6-4-6-4z"></path>
    </svg>
  `;

  const body = document.createElement('div');
  body.className = 'comd-recordings-card-body';

  const title = document.createElement('h3');
  title.textContent = record.title || '';

  const dateText = formatSheetDate(record.date);
  if (dateText) {
    const date = document.createElement('p');
    date.className = 'comd-recordings-date';
    date.textContent = dateText;
    body.append(date);
  }

  const description = document.createElement('p');
  description.className = 'comd-recordings-description';
  description.textContent = record.description || '';

  const link = document.createElement('a');
  link.className = 'comd-recordings-link';
  link.textContent = 'View recording';
  link.href = (record.link || '').trim() || '#';
  link.target = '_blank';
  link.rel = 'noopener';

  body.prepend(title);
  body.append(description, link);

  card.append(top, body);
  return card;
}

export default async function decorate(block) {
  const source = block.querySelector(':scope > div > div')?.textContent?.trim();
  const relativeSource = toRelativeUrl(source);

  block.textContent = '';
  if (!relativeSource) return;

  try {
    const response = await fetch(relativeSource, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to fetch ${relativeSource}`);

    const payload = await response.json();
    const records = Array.isArray(payload?.data) ? payload.data : [];
    const queryName = new URL(window.location.href).searchParams.get('name');
    const filtered = resolveCommunityRecords(records, queryName);

    const heading = document.createElement('h2');
    heading.className = 'comd-recordings-heading';
    heading.textContent = 'Recordings';

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'comd-recordings-empty';
      empty.textContent = 'No recordings.';
      block.append(heading, empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'comd-recordings-grid';
    filtered.forEach((record) => grid.append(createRecordingCard(record)));

    block.append(heading, grid);
  } catch (e) {
    const fallback = document.createElement('p');
    fallback.className = 'comd-recordings-error';
    fallback.textContent = 'Unable to load recordings.';
    block.append(fallback);
  }
}
