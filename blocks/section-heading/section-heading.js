/**
 * Section Heading block
 * Authoring pattern (table):
 *  | Title | (optional desc) |
 *  | Description | |
 * Only the first two child divs are used (title, description).
 */
export default function decorate(block) {
  const rows = [...block.children];
  const titleRow = rows[0];
  const descRow = rows[1];

  const titleText = titleRow ? titleRow.textContent.trim() : '';
  const descText = descRow ? descRow.textContent.trim() : '';

  const container = document.createElement('div');
  container.className = 'section-heading';

  if (titleText) {
    const h2 = document.createElement('h2');
    h2.textContent = titleText;
    container.append(h2);
  }

  if (descText) {
    const p = document.createElement('p');
    p.textContent = descText;
    container.append(p);
  }

  block.textContent = '';
  block.append(container);
} 