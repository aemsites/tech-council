function normalizeIconName(name = '') {
  const value = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return value || 'community-link';
}

const ICON_SCALE_OVERRIDES = {
  evals: 1.3,
  'program-management': 1.2,
};

function createDetailsHref(name) {
  return `/communities/details?name=${encodeURIComponent(name)}`;
}

function createCardFromData(item) {
  const name = String(item?.name || '').trim();
  const titleText = String(item?.title || '').trim();
  const descriptionText = String(item?.description || '').trim();
  if (!name || !titleText) return null;

  const iconName = normalizeIconName(name);
  const basePath = window.hlx?.codeBasePath || '';
  const iconSrc = `${basePath}/icons/${iconName}.svg`;
  const destination = createDetailsHref(name);

  const li = document.createElement('li');
  li.classList.add('com-groups-card');
  const iconScale = ICON_SCALE_OVERRIDES[iconName] || 1;
  li.style.setProperty('--com-groups-icon-scale', String(iconScale));

  const iconWrap = document.createElement('div');
  iconWrap.className = 'com-groups-icon-wrap';
  const iconImg = document.createElement('img');
  iconImg.className = 'com-groups-icon';
  iconImg.src = iconSrc;
  iconImg.alt = '';
  iconImg.loading = 'lazy';
  iconImg.decoding = 'async';
  iconImg.onerror = () => { iconImg.src = `${basePath}/icons/community-link.svg`; };
  iconWrap.append(iconImg);

  const title = document.createElement('div');
  title.className = 'com-groups-title';
  const h3 = document.createElement('h3');
  h3.textContent = titleText;
  title.append(h3);

  const description = document.createElement('p');
  description.className = 'com-groups-description';
  description.textContent = descriptionText;

  const link = document.createElement('a');
  link.className = 'com-groups-link';
  link.href = destination;
  link.setAttribute('aria-label', `Open ${titleText} details`);
  link.textContent = `Open ${titleText}`;

  li.append(iconWrap, title, description, link);
  return li;
}

async function fetchGroupsData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch groups (${response.status})`);
  const json = await response.json();
  return Array.isArray(json?.data) ? json.data : [];
}

function getSourceUrl(block) {
  const sourceLink = block.querySelector('a[href]');
  if (!sourceLink) return '';
  try {
    const parsed = new URL(sourceLink.href, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return '';
  }
}

function createEmptyState() {
  const li = document.createElement('li');
  li.className = 'com-groups-card com-groups-empty';

  const title = document.createElement('h3');
  title.textContent = 'Communities coming soon';

  const description = document.createElement('p');
  description.textContent = 'Community groups are being updated. Please check back shortly.';

  li.append(title, description);
  return li;
}

export default async function decorate(block) {
  const ul = document.createElement('ul');
  const sourceUrl = getSourceUrl(block);
  let hasItems = false;

  try {
    const items = sourceUrl ? await fetchGroupsData(sourceUrl) : [];
    items.forEach((item) => {
      const card = createCardFromData(item);
      if (card) {
        ul.append(card);
        hasItems = true;
      }
    });
  } catch (e) {
    // show empty-state card instead of exposing raw config links
  }

  if (!hasItems) {
    ul.append(createEmptyState());
  }

  block.textContent = '';
  block.append(ul);
}
