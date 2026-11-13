import decorateBackendSearch from '../backend-search/backend-search.js';

export default function decorate(block) {
  block.classList.add('backend-search');
  decorateBackendSearch(block);
}
