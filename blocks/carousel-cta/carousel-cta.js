import decorateCarousel from '../carousel/carousel.js';

/**
 * Decorates the carousel-cta block. It first leverages the base carousel
 * behavior and then applies specific classes to title, description and CTA
 * link elements within each slide's content area.
 *
 * Expected authoring pattern per slide column:
 *  Column 1 – Image (picture)
 *  Column 2 – Title (heading), Description (paragraph), CTA (link or button)
 *
 * After decoration you will have:
 *   .carousel-cta-title        → the heading element
 *   .carousel-cta-description  → the first paragraph element
 *   .carousel-cta-button       → the CTA link / button element
 *
 * @param {HTMLElement} block The carousel-cta block element
 */
export default async function decorate(block) {
  // Ensure base carousel class to inherit styles & logic
  block.classList.add('carousel');

  // Run the base carousel decoration
  await decorateCarousel(block);

  // Assign block-specific class for easier styling
  block.classList.add('carousel-cta');

  // Walk through each slide and tag internal elements
  block.querySelectorAll('.carousel-slide-content').forEach((content) => {
    // Determine title element: heading, otherwise first <p> with <strong>
    let title = content.querySelector('h1, h2, h3, h4, h5, h6');
    if (!title) {
      title = Array.from(content.children).find((el) => el.tagName === 'P' && el.querySelector('strong'));
    }
    if (title) {
      title.classList.add('carousel-cta-title');
    }

    // Determine description: first <p> that is not the title and does not contain a link/button
    const description = Array.from(content.querySelectorAll('p')).find((p) => p !== title && !p.querySelector('a, button'));
    if (description) {
      description.classList.add('carousel-cta-description');
    }

    // CTA – first anchor or button element
    const cta = content.querySelector('a, button');
    if (cta) {
      cta.classList.add('carousel-cta-button');
      if (cta.tagName === 'A' && !cta.classList.contains('button')) {
        cta.classList.add('button');
      }
    }
  });
} 