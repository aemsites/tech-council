import { createOptimizedPicture, decorateIcons } from '../../scripts/aem.js';

/**
 * Decorates the Events block by converting its direct children into a list of event cards.
 * Each row becomes a list item with its content split between an image and a body container.
 *
 * @param {HTMLElement} block The events block element
 */
export default function decorate(block) {
  try {
    const ul = document.createElement('ul');

    [...block.children].forEach((row) => {
      const li = document.createElement('li');

      // Move all children of the current row into the list item
      while (row.firstElementChild) {
        li.append(row.firstElementChild);
      }

      // Identify image and body containers
      [...li.children].forEach((div) => {
        if (div.children.length === 1 && div.querySelector('picture')) {
          div.className = 'events-card-image';
        } else {
          div.className = 'events-card-body';
        }
      });

      ul.append(li);

      // Assign semantic classes to body children (title, date, location)
      const body = li.querySelector('.events-card-body');
      if (body) {
        // If content not already separated into multiple elements, split by <br>
        if (body.children.length === 1) {
          const container = body.children[0];
          // Only proceed if container has <br> markers
          if (container.innerHTML.includes('<br')) {
            const parts = container.innerHTML.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
            body.textContent = '';
            parts.forEach((html, idx) => {
              const p = document.createElement('p');
              p.innerHTML = html;
              body.append(p);
            });
          }
        }

        // Apply classes based on ordering
        [...body.children].forEach((child, idx) => {
          child.classList.remove('events-card-title', 'events-card-date', 'events-card-location');
          if (idx === 0) child.classList.add('events-card-title');
          else if (idx === 1) child.classList.add('events-card-date');
          else if (idx === 2) child.classList.add('events-card-location');
        });

        // Inject icons for date and location
        const dateEl = body.querySelector('.events-card-date');
        if (dateEl && !dateEl.querySelector('span.icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon icon-calendar';
          iconSpan.setAttribute('aria-hidden', 'true');
          dateEl.prepend(iconSpan);
        }

        const locationEl = body.querySelector('.events-card-location');
        if (locationEl && !locationEl.querySelector('span.icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon icon-location';
          iconSpan.setAttribute('aria-hidden', 'true');
          locationEl.prepend(iconSpan);
        }

        // Convert icon spans to images
        decorateIcons(body);
      }
    });

    // Optimise pictures for responsive loading
    ul.querySelectorAll('picture > img').forEach((img) => {
      const picture = img.closest('picture');
      if (picture) {
        picture.replaceWith(
          createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
        );
      }
    });

    // Ensure links open in new tab
    ul.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });

    // Replace block content with the generated list
    block.textContent = '';
    block.append(ul);
  } catch (error) {
    // Log any errors to the console for easier debugging
    // eslint-disable-next-line no-console
    console.error('Failed to decorate events block:', error);
  }
} 