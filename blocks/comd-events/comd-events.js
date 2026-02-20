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

function parseSheetDate(value) {
  if (value == null || value === '') return null;

  const num = Number(value);
  if (!Number.isNaN(num)) {
    return new Date((num - 25569) * 86400 * 1000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameOrFuture(date) {
  if (!date) return false;
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const valueDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return valueDayStart >= dayStart;
}

function formatUpcomingDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatPastDate(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function resolveCommunityEvents(records, queryName) {
  if (!records.length) return [];
  if (!queryName) return records;

  const normalizedQuery = normalizeKey(queryName);

  return records.filter((entry) => {
    const eventName = normalizeKey(entry.name);
    return eventName === normalizedQuery
      || eventName.startsWith(normalizedQuery)
      || normalizedQuery.startsWith(eventName);
  });
}

function createEventItem(event) {
  const item = document.createElement('article');
  const date = parseSheetDate(event.date);
  const upcoming = isSameOrFuture(date);
  item.className = `comd-events-item ${upcoming ? 'is-upcoming' : 'is-past'}`;

  const badge = document.createElement('span');
  badge.className = 'comd-events-badge';
  badge.textContent = upcoming ? 'UPCOMING' : 'PAST';

  const content = document.createElement('div');
  content.className = 'comd-events-content';

  const title = document.createElement('h3');
  title.textContent = event.title || '';

  const meta = document.createElement('p');
  meta.className = 'comd-events-meta';
  const dateText = upcoming ? formatUpcomingDate(date) : formatPastDate(date);
  meta.textContent = upcoming && event.duration
    ? `${dateText} · ${event.duration}`
    : dateText;

  const description = document.createElement('p');
  description.className = 'comd-events-description';
  description.textContent = event.description || '';

  content.append(title, meta, description);
  item.append(badge, content);

  return { item, date, upcoming };
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
    const filtered = resolveCommunityEvents(records, queryName);

    const heading = document.createElement('h2');
    heading.className = 'comd-events-heading';
    heading.textContent = 'Events';

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'comd-events-empty';
      empty.textContent = 'No events.';
      block.append(heading, empty);
      return;
    }

    const rendered = filtered.map(createEventItem);
    const upcoming = rendered
      .filter((entry) => entry.upcoming)
      .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
    const past = rendered
      .filter((entry) => !entry.upcoming)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    const list = document.createElement('div');
    list.className = 'comd-events-list';
    [...upcoming, ...past].forEach((entry) => list.append(entry.item));

    block.append(heading, list);
  } catch (e) {
    const fallback = document.createElement('p');
    fallback.className = 'comd-events-error';
    fallback.textContent = 'Unable to load events.';
    block.append(fallback);
  }
}
