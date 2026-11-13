import decorateCarousel from '../carousel/carousel.js';

/**
 * Decorates the carousel-cta block. It leverages the base carousel behavior and
 * then turns each slide into a single, centered content card (styled to match
 * the event cards).
 *
 * Authoring pattern per slide: a single column containing
 *   Title (heading), Description (paragraph) and an optional CTA (link/button).
 *
 * After decoration each slide contains:
 *   .carousel-cta-card         → the content wrapper (the card)
 *   .carousel-cta-title        → the heading element
 *   .carousel-cta-description  → the description paragraph
 *   .carousel-cta-button       → the CTA link / button element
 *
 * Variant: authoring the block as "Carousel CTA (note)" adds a `note` class,
 * which renders the content as a centered message with an inline link (e.g. an
 * email address) instead of converting the link into a button.
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

  const isNote = block.classList.contains('note');

  block.querySelectorAll('.carousel-slide').forEach((slide) => {
    const columns = Array.from(slide.querySelectorAll(':scope > div'));

    // The base carousel may label a single column as the "image" column.
    // Pick the column that actually holds the content (heading/text/link).
    const card = columns.find((col) => col.querySelector('h1, h2, h3, h4, h5, h6, p, a, button'))
      || columns[0];
    if (!card) return;

    // Drop any legacy/empty columns (e.g. a previous background-image column)
    columns.forEach((col) => {
      if (col !== card) col.remove();
    });

    card.className = 'carousel-cta-card';

    // Unwrap any single-item lists (stray bullets from authoring) and remove
    // empty leftover nodes so the card sizes to its real content.
    card.querySelectorAll('ul, ol').forEach((list) => {
      const items = Array.from(list.children);
      items.forEach((li) => list.before(...li.childNodes));
      list.remove();
    });
    card.querySelectorAll(':scope > *').forEach((el) => {
      const hasMedia = el.querySelector('img, picture, a, button, svg');
      if (!el.textContent.trim() && !hasMedia) el.remove();
    });

    // Note mode: either the explicit "note" variant, or when the only link is
    // an email (mailto:). Keep the content as a centered message and leave the
    // link inline instead of converting it into a button.
    const firstLink = card.querySelector('a');
    const href = firstLink ? (firstLink.getAttribute('href') || '').trim().toLowerCase() : '';
    const linkText = firstLink ? firstLink.textContent.trim() : '';
    const isEmail = href.startsWith('mailto:') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkText);
    if (isNote || isEmail) {
      card.classList.add('is-note');
      card.querySelectorAll('a').forEach((link) => link.classList.add('carousel-cta-link'));
      return;
    }

    // Title: a heading, otherwise the first <p> wrapping <strong>
    let title = card.querySelector('h1, h2, h3, h4, h5, h6');
    if (!title) {
      title = Array.from(card.children).find((el) => el.tagName === 'P' && el.querySelector('strong'));
    }
    if (title) {
      title.classList.add('carousel-cta-title');
    }

    // Description: first <p> that is not the title and has no link/button
    const description = Array.from(card.querySelectorAll('p'))
      .find((p) => p !== title && !p.querySelector('a, button'));
    if (description) {
      description.classList.add('carousel-cta-description');
    }

    // CTA: first anchor or button element
    const cta = card.querySelector('a, button');
    if (cta) {
      cta.classList.add('carousel-cta-button');
      if (cta.tagName === 'A' && !cta.classList.contains('button')) {
        cta.classList.add('button');
      }
    }

    // Group title + description so the CTA can sit beside them on wide screens
    const textNodes = [title, description].filter(Boolean);
    if (textNodes.length) {
      const textWrap = document.createElement('div');
      textWrap.className = 'carousel-cta-text';
      textNodes[0].before(textWrap);
      textNodes.forEach((node) => textWrap.append(node));
    }

    // Ensure the CTA is a standalone element placed after the text block — even
    // if it was authored inside the title/description paragraph — so it can be
    // pushed to the right on wide screens.
    if (cta) {
      card.append(cta);
    }
  });
}
