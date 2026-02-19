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

function resolveCommunityResources(records, queryName) {
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

function parseDateValue(value) {
  if (value == null || value === '') return Number.MIN_SAFE_INTEGER;
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  return Number.MIN_SAFE_INTEGER;
}

function createResourceCard(record) {
  const card = document.createElement('article');
  card.className = 'comd-resources-card';

  const title = document.createElement('h3');
  title.textContent = record.title || '';

  const description = document.createElement('p');
  description.className = 'comd-resources-description';
  description.textContent = record.description || '';

  const link = document.createElement('a');
  link.className = 'comd-resources-link';
  link.href = (record.link || '').trim() || '#';
  link.textContent = 'Read playbook →';
  link.target = '_blank';
  link.rel = 'noopener';

  if (!record.link) {
    link.removeAttribute('href');
    link.classList.add('is-disabled');
  }

  card.append(title, description, link);
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
    const filtered = resolveCommunityResources(records, queryName)
      .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));

    if (!filtered.length) return;

    const heading = document.createElement('h2');
    heading.className = 'comd-resources-heading';
    heading.textContent = 'Content & playbooks';

    const grid = document.createElement('div');
    grid.className = 'comd-resources-grid';
    filtered.forEach((record) => grid.append(createResourceCard(record)));

    block.append(heading, grid);
  } catch (e) {
    const fallback = document.createElement('p');
    fallback.className = 'comd-resources-error';
    fallback.textContent = 'Unable to load resources.';
    block.append(fallback);
  }
}
