export default function decorate(block) {
  const ul = document.createElement('ul');
  const iconClasses = ['icon-link', 'icon-agent', 'icon-code', 'icon-rag'];

  [...block.children].forEach((row, index) => {
    const li = document.createElement('li');
    li.classList.add('com-groups-card');
    li.classList.add(iconClasses[index % iconClasses.length]);
    while (row.firstElementChild) li.append(row.firstElementChild);

    const [title, description] = li.children;

    if (title) title.className = 'com-groups-title';
    if (description) description.className = 'com-groups-description';

    // This block should render links as plain text links, not global CTA buttons.
    li.querySelectorAll('.button-container').forEach((container) => {
      container.classList.remove('button-container');
    });
    li.querySelectorAll('a.button, a.button.primary, a.button.secondary').forEach((link) => {
      link.classList.remove('button', 'primary', 'secondary');
    });

    const links = li.querySelectorAll('a[href]');
    const firstLink = links[0];
    let communityName = '';

    if (firstLink) {
      try {
        const parsedUrl = new URL(firstLink.href, window.location.origin);
        communityName = parsedUrl.searchParams.get('name') || '';
      } catch (e) {
        communityName = '';
      }
    }

    if (!communityName && title?.textContent) {
      communityName = title.textContent
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    if (communityName) {
      const destination = `/communities/details?name=${encodeURIComponent(communityName)}`;
      li.classList.add('is-clickable');
      li.setAttribute('role', 'link');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-label', `Open ${title?.textContent?.trim() || 'community'} details`);

      links.forEach((link) => {
        link.href = destination;
        link.removeAttribute('target');
        link.removeAttribute('rel');
      });

      li.addEventListener('click', (event) => {
        if (event.target.closest('a')) return;
        window.location.assign(destination);
      });

      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.assign(destination);
        }
      });
    }

    ul.append(li);
  });


  block.textContent = '';
  block.append(ul);
}
