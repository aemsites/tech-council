import { decorateIcons } from '../../scripts/aem.js';

function toRelativeUrl(input) {
  if (!input) return '';
  const value = input.trim();
  if (!value) return '';

  if (value.startsWith('/')) return value;
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return `/${value.replace(/^\/+/, '')}`;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return '';
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

function resolveIconName(record) {
  const name = String(record?.name || '').trim();
  if (!name) return 'community-link';
  return normalizeKey(name) || 'community-link';
}

function pickCommunity(records, queryName) {
  if (!records.length) return null;
  if (!queryName) return records[0];

  const normalizedQuery = normalizeKey(queryName);

  return records.find((entry) => normalizeKey(entry.name) === normalizedQuery)
    || records.find((entry) => normalizeKey(entry.title) === normalizedQuery)
    || records.find((entry) => normalizeKey(entry.name).startsWith(normalizedQuery))
    || records.find((entry) => normalizedQuery.startsWith(normalizeKey(entry.name)))
    || records[0];
}

export default async function decorate(block) {
  const source = block.querySelector(':scope > div > div')?.textContent?.trim();
  const relativeSource = toRelativeUrl(source);

  block.textContent = '';

  if (!relativeSource) {
    return;
  }

  try {
    const response = await fetch(relativeSource, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to fetch ${relativeSource}`);
    const payload = await response.json();
    const records = Array.isArray(payload?.data) ? payload.data : [];

    const nameFromUrl = new URL(window.location.href).searchParams.get('name');
    const selected = pickCommunity(records, nameFromUrl);

    if (!selected) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'comd-details-item';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'comd-details-icon-wrap';
    const icon = document.createElement('span');
    icon.className = `icon icon-${resolveIconName(selected)}`;
    iconWrap.append(icon);

    const content = document.createElement('div');
    content.className = 'comd-details-content';
    const title = document.createElement('p');
    title.className = 'comd-details-title';
    title.textContent = selected.title || '';
    const description = document.createElement('p');
    description.textContent = selected.description || '';
    content.append(title, description);

    wrapper.append(iconWrap, content);

    block.append(wrapper);
    decorateIcons(block);
  } catch (e) {
    const fallback = document.createElement('p');
    fallback.className = 'comd-details-error';
    fallback.textContent = 'Unable to load community details.';
    block.append(fallback);
  }
}
