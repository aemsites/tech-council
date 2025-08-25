import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Banner block decorator.
 * Expected markup:
 *  <div class="banner">
 *    <div><picture>...background image...</picture></div>
 *    <div>
 *      <h2>Title</h2>
 *      <p>Description text</p>
 *      <p><a href="..." class="button">CTA</a></p>
 *    </div>
 *  </div>
 *
 * The picture is stretched behind the content via CSS; this decorator simply
 * optimizes the picture source and adds resiliency.
 *
 * @param {HTMLElement} block The block element
 */
export default function decorate(block) {
  try {
    const firstPicture = block.querySelector('picture');
    if (firstPicture && firstPicture.querySelector('img')) {
      const img = firstPicture.querySelector('img');
      const optimized = createOptimizedPicture(img.src, img.alt, true, [
        { media: '(min-width: 600px)', width: '2000' },
        { width: '750' },
      ]);
      firstPicture.replaceWith(optimized);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Banner block decoration failed', error);
  }
} 