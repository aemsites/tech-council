function getCommunityIconClass(name = '', index = 0) {
  const value = String(name).toLowerCase();
  if (value.includes('agent')) return 'icon-agent';
  if (value.includes('coding') || value.includes('code') || value.includes('ide')) return 'icon-code';
  if (value.includes('rag')) return 'icon-rag';
  if (value.includes('mcp') || value.includes('link')) return 'icon-link';
  const iconClasses = ['icon-link', 'icon-agent', 'icon-code', 'icon-rag'];
  return iconClasses[index % iconClasses.length];
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

  const li = document.createElement('li');
  li.classList.add('com-groups-card', getCommunityIconClass(name, index));

  const title = document.createElement('div');
  title.className = 'com-groups-title';
  const h3 = document.createElement('h3');
  h3.textContent = titleText;
  title.append(h3);

  const description = document.createElement('p');
  description.className = 'com-groups-description';
  description.textContent = descriptionText;

  li.append(title, description);

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
