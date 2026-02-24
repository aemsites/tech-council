export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    const [title, subtitle, responsibilities, commitment] = li.children;

    if (title) title.className = 'com-roles-title';
    if (subtitle) subtitle.className = 'com-roles-subtitle';
    if (responsibilities) {
      responsibilities.className = 'com-roles-responsibilities';
      const list = responsibilities.querySelector('ul');
      if (list) list.classList.add('com-roles-list');
    }
    if (commitment) commitment.className = 'com-roles-commitment';

    ul.append(li);
  });

  block.textContent = '';
  block.append(ul);
}
