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

function resolveCommunityRoles(records, queryName) {
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

function roleRank(role) {
  const normalized = normalizeKey(role);
  if (normalized.includes('community-lead') || normalized === 'lead') return 0;
  if (normalized.includes('co-lead') || normalized.includes('colead')) return 1;
  return 2;
}

function createRoleCard(record) {
  const card = document.createElement('article');
  card.className = 'comd-roles-card';
  card.innerHTML = `
    <div class="comd-roles-avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2"></circle>
        <path d="M6.5 18a5.5 5.5 0 0 1 11 0"></path>
      </svg>
    </div>
    <p class="comd-roles-role">${record.role || ''}</p>
    <h3 class="comd-roles-name">${record.emp || ''}</h3>
  `;
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
    const filtered = resolveCommunityRoles(records, queryName)
      .sort((a, b) => roleRank(a.role) - roleRank(b.role));

    if (!filtered.length) return;

    const heading = document.createElement('h2');
    heading.className = 'comd-roles-heading';
    heading.textContent = 'People in roles';

    const grid = document.createElement('div');
    grid.className = 'comd-roles-grid';
    filtered.forEach((record) => grid.append(createRoleCard(record)));

    block.append(heading, grid);
  } catch (e) {
    const fallback = document.createElement('p');
    fallback.className = 'comd-roles-error';
    fallback.textContent = 'Unable to load role details.';
    block.append(fallback);
  }
}
