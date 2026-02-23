import { decorateIcons } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';

/**
 * Decorates icon-cards block converting its default table structure into
 * semantic list (<ul><li>) with icon and body sections.
 *
 * Authoring pattern (per card row):
 *  | Icon | Content |
 * Where *Icon* cell contains a span with class="icon icon-name" or an inline SVG.
 *
 * The first column transforms to `.icon-cards-card-icon` and all remaining
 * columns become `.icon-cards-card-body`.
 *
 * @param {HTMLElement} block
 */

/**
 * Update edge classes for decorative gradients and check if scrolling is needed
 */
function updateEdgeClasses(block, ul) {
  const scrollLeft = ul.scrollLeft;
  const maxScrollLeft = ul.scrollWidth - ul.clientWidth;
  
  // Check if scrolling is needed
  const needsScroll = ul.scrollWidth > ul.clientWidth + 5;
  block.classList.toggle('has-scroll', needsScroll);
  
  block.classList.toggle('at-start', scrollLeft <= 1);
  block.classList.toggle('at-end', scrollLeft >= maxScrollLeft - 1);
}

/**
 * Bind carousel events
 */
function bindCarouselEvents(block, ul, prevButton, nextButton) {
  // Update initial edge classes
  updateEdgeClasses(block, ul);
  
  prevButton.addEventListener('click', () => {
    const page = ul.clientWidth;
    if (ul.scrollLeft <= 0) {
      ul.scrollTo({ left: ul.scrollWidth - ul.clientWidth, behavior: 'smooth' });
    } else {
      ul.scrollBy({ left: -page, behavior: 'smooth' });
    }
  });

  nextButton.addEventListener('click', () => {
    const page = ul.clientWidth;
    const maxScrollLeft = ul.scrollWidth - ul.clientWidth - 1;
    if (ul.scrollLeft >= maxScrollLeft) {
      ul.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      ul.scrollBy({ left: page, behavior: 'smooth' });
    }
  });

  // Keyboard navigation
  block.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevButton.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextButton.click();
    }
  });

  // Update edge classes on scroll
  let scrollTimeout;
  ul.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      updateEdgeClasses(block, ul);
    }, 100);
  });

  // Update on window resize
  window.addEventListener('resize', () => {
    updateEdgeClasses(block, ul);
  });
}

function toRelativeUrl(input) {
  if (!input) return '';
  try {
    const parsed = new URL(input, window.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch (e) {
    return '';
  }
}

/**
 * Data-source mode trigger:
 * icon-cards block has exactly 1 row and 1 cell with a URL.
 */
function getSourceUrl(block) {
  const rows = [...block.children];
  if (rows.length !== 1) return '';
  const cells = [...rows[0].children];
  if (cells.length !== 1) return '';

  const cell = cells[0];
  const link = cell.querySelector('a[href]')?.href;
  const raw = cell.textContent?.trim();
  return toRelativeUrl(link || raw);
}

function createCardFromRecord(record = {}) {
  const li = document.createElement('li');
  li.className = 'icon-cards-card';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'icon-cards-card-icon';
  const iconName = String(record.icon || '').trim();
  if (iconName) {
    const icon = document.createElement('span');
    icon.className = `icon icon-${iconName}`;
    iconWrap.append(icon);
  }

  const body = document.createElement('div');
  body.className = 'icon-cards-card-body';

  const title = document.createElement('h3');
  const titleText = String(record.title || '').trim();
  title.textContent = titleText;

  const description = document.createElement('p');
  description.textContent = String(record.description || '').trim();

  body.append(title, description);

  const destination = String(record.link || '').trim();
  if (destination) {
    li.classList.add('has-link');
    const titleLink = document.createElement('a');
    titleLink.href = destination;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener';
    titleLink.textContent = titleText || destination;
    title.textContent = '';
    title.append(titleLink);
  }

  li.append(iconWrap, body);
  return li;
}

function buildListFromAuthoredRows(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'icon-cards-card';
    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div, idx) => {
      if (idx === 0) {
        div.className = 'icon-cards-card-icon';
      } else {
        div.className = 'icon-cards-card-body';
      }
    });

    ul.append(li);
  });
  return ul;
}

async function buildListFromDataSource(sourceUrl) {
  const ul = document.createElement('ul');
  const response = await fetch(sourceUrl, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${sourceUrl}`);

  const payload = await response.json();
  const records = Array.isArray(payload?.data) ? payload.data : [];
  records.forEach((record) => {
    ul.append(createCardFromRecord(record));
  });
  return ul;
}

export default async function decorate(block) {
  const placeholders = await fetchPlaceholders();
  const sourceUrl = getSourceUrl(block);
  block.classList.toggle('icon-cards-data-source', Boolean(sourceUrl));
  let ul;
  if (sourceUrl) {
    try {
      ul = await buildListFromDataSource(sourceUrl);
    } catch (e) {
      ul = document.createElement('ul');
    }
  } else {
    ul = buildListFromAuthoredRows(block);
  }

  block.textContent = '';

  /* --- Carousel Enhancements --- */
  const carouselWrapper = document.createElement('div');
  carouselWrapper.classList.add('icon-cards-carousel-wrapper');

  const slidesContainer = document.createElement('div');
  slidesContainer.classList.add('icon-cards-carousel-container');

  // Navigation buttons
  const navButtons = document.createElement('div');
  navButtons.className = 'icon-cards-carousel-nav';
  
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.className = 'icon-cards-nav-prev';
  prevButton.setAttribute('aria-label', placeholders.previousSlide || 'Previous Slide');

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'icon-cards-nav-next';
  nextButton.setAttribute('aria-label', placeholders.nextSlide || 'Next Slide');

  navButtons.append(prevButton, nextButton);

  // Make all links open in new tab
  ul.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });
  decorateIcons(ul);

  slidesContainer.appendChild(ul);
  slidesContainer.appendChild(navButtons);
  carouselWrapper.appendChild(slidesContainer);
  block.append(carouselWrapper);

  // Set initial edge class
  block.classList.add('at-start');

  // Bind events
  bindCarouselEvents(block, ul, prevButton, nextButton);
  
  // Update edge classes after layout is calculated
  setTimeout(() => {
    updateEdgeClasses(block, ul);
  }, 100);
}
