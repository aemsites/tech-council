import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  if (fragment) {
    while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
  } else {
    footer.className = 'footer-masthead';
    const brand = document.createElement('strong');
    brand.textContent = 'Tech Council';
    const description = document.createElement('p');
    description.textContent = 'Technical collaboration and knowledge sharing at Adobe.';
    const feedback = document.createElement('a');
    feedback.href = '/feedback';
    feedback.textContent = 'Feedback Form';
    footer.append(brand, description, feedback);
  }

  block.append(footer);
}
