import { decorateIcons } from '../../scripts/aem.js';

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
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div, idx) => {
      if (idx === 0) {
        div.className = 'icon-cards-card-icon';
        // icon decoration handled globally to avoid duplicates
      } else {
        div.className = 'icon-cards-card-body';
      }
    });

    ul.append(li);
  });

  block.textContent = '';

  /* --- Carousel Enhancements --- */
  const carouselWrapper = document.createElement('div');
  carouselWrapper.classList.add('icon-cards-carousel');

  // Navigation buttons
  const prevButton = document.createElement('button');
  prevButton.className = 'icon-cards-nav icon-cards-prev';
  prevButton.setAttribute('aria-label', 'Previous');

  const nextButton = document.createElement('button');
  nextButton.className = 'icon-cards-nav icon-cards-next';
  nextButton.setAttribute('aria-label', 'Next');

  carouselWrapper.append(prevButton, ul, nextButton);

  // Make all links open in new tab
  ul.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });

  block.append(carouselWrapper);

  /* Scrolling behavior */
  function getPageWidth() {
    // Amount to scroll to show a new full set of cards
    return ul.clientWidth;
  }

  prevButton.addEventListener('click', () => {
    const page = getPageWidth();
    if (ul.scrollLeft <= 0) {
      ul.scrollTo({ left: ul.scrollWidth - ul.clientWidth, behavior: 'smooth' });
    } else {
      ul.scrollBy({ left: -page, behavior: 'smooth' });
    }
  });

  nextButton.addEventListener('click', () => {
    const page = getPageWidth();
    const maxScrollLeft = ul.scrollWidth - ul.clientWidth - 1;
    if (ul.scrollLeft >= maxScrollLeft) {
      ul.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      ul.scrollBy({ left: page, behavior: 'smooth' });
    }
  });
} 