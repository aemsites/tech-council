export default function decorate(block) {
  const icon = document.createElement('div');
  icon.className = 'thankyou-icon';
  icon.setAttribute('aria-hidden', 'true');

  const message = document.createElement('div');
  message.className = 'thankyou-message';
  message.append(...block.childNodes);
  message.querySelectorAll('.icon').forEach((element) => element.remove());
  if (!message.textContent.trim() && !message.querySelector('img')) {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Thank you!';
    message.append(paragraph);
  }

  block.appendChild(icon);
  block.appendChild(message);

  document.body.classList.add('thankyou-page');
  document.documentElement.classList.add('thankyou-page');

  const footer = document.querySelector('footer');
  if (footer) {
    footer.classList.add('thankyou-hidden');
  }

  const main = document.querySelector('main');
  if (main) {
    main.classList.add('thankyou-main');
  }
}
