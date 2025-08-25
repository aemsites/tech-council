import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Decorate recordings block into a vertical list where each row has
 * image on the left and text content on the right.
 * Authoring expects two columns per row: Image | Text
 */
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'recordings-card-image';
      } else {
        div.className = 'recordings-card-body';
      }
    });

    ul.append(li);
  });

  // optimise pictures
  ul.querySelectorAll('picture > img').forEach((img) => {
    const pic = img.closest('picture');
    pic.replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]));
  });

  // Make all links open in new tab
  ul.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });

  block.textContent = '';
  block.append(ul);
} 