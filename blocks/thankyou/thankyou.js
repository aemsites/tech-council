export default function decorate(block) {
  const paragraphs = block.querySelectorAll('p');
  let messageText = 'Thank you!';

  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    if (text && !p.querySelector('.icon')) {
      messageText = text;
    }
  });

  block.innerHTML = '';

  const icon = document.createElement('div');
  icon.className = 'thankyou-icon';
  icon.setAttribute('aria-hidden', 'true');

  const message = document.createElement('div');
  message.className = 'thankyou-message';
  const messagePara = document.createElement('p');
  messagePara.textContent = messageText;
  message.appendChild(messagePara);

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
