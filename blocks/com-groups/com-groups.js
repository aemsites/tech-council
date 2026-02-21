function normalizeIconName(name = '') {
  const value = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return value || 'community-link';
}

function makeCardInteractive(li, destination, label = 'community') {
  li.classList.add('is-clickable');
  li.setAttribute('role', 'link');
  li.setAttribute('tabindex', '0');
  li.setAttribute('aria-label', `Open ${label} details`);
  li.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    window.location.assign(destination);
  });
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      window.location.assign(destination);
    }
  });
}

function createCardFromData(item, index) {
  const name = String(item?.name || '').trim();
  const titleText = String(item?.title || '').trim();
  const descriptionText = String(item?.description || '').trim();
  if (!name || !titleText) return null;

  const iconName = normalizeIconName(name);
  const basePath = window.hlx?.codeBasePath || '';
  const iconSrc = `${basePath}/icons/${iconName}.svg`;

  const li = document.createElement('li');
  li.classList.add('com-groups-card');

  const iconImg = document.createElement('img');
  iconImg.className = 'com-groups-icon';
  iconImg.src = iconSrc;
  iconImg.alt = '';
  iconImg.loading = 'lazy';
  iconImg.width = 56;
  iconImg.height = 56;
  iconImg.onerror = () => { iconImg.src = `${basePath}/icons/community-link.svg`; };

  const title = document.createElement('div');
  title.className = 'com-groups-title';
  const h3 = document.createElement('h3');
  h3.textContent = titleText;
  title.append(h3);

  const description = document.createElement('p');
  description.className = 'com-groups-description';
  description.textContent = descriptionText;

  li.append(iconImg, title, description);

  const destination = `/communities/details?name=${encodeURIComponent(name)}`;
  makeCardInteractive(li, destination, titleText);
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

export default async function decorate(block) {
  const ul = document.createElement('ul');
  const sourceUrl = getSourceUrl(block);

  try {
    const items = sourceUrl ? await fetchGroupsData(sourceUrl) : [];
    items.forEach((item, index) => {
      const card = createCardFromData(item, index);
      if (card) ul.append(card);
    });
  } catch (e) {
    // keep block empty on fetch errors to avoid exposing raw config links
  }

  block.textContent = '';
  block.append(ul);
}
