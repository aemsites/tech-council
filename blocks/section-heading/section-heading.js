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
    const authoredId = titleRow.querySelector('[id]')?.id;
    if (authoredId) h2.id = authoredId;
    container.append(h2);

    if (window.location.pathname === '/') {
      const destinations = { Events: '/events', Communities: '/communities/' };
      if (destinations[titleText]) {
        const link = document.createElement('a');
        link.className = 'section-heading-link';
        link.href = destinations[titleText];
        link.textContent = `View all ${titleText.toLowerCase()}`;
        container.append(link);
      }
    }
  }

  if (descText) {
    const p = document.createElement('p');
    p.textContent = descText;
    container.append(p);
  }

  block.textContent = '';
  block.append(container);
}
