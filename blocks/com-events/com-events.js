export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    const [frequency, title, duration, description] = li.children;

    if (frequency) frequency.className = 'com-events-frequency';
    if (title) title.className = 'com-events-title';
    if (duration) duration.className = 'com-events-duration';
    if (description) description.className = 'com-events-description';

    ul.append(li);
  });

  block.textContent = '';
  block.append(ul);
}
