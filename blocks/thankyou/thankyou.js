export default function decorate(block) {
  // Get the text content from all paragraphs in the block
  const paragraphs = block.querySelectorAll('p');
  let messageText = 'Thank you!';
  
  // Find the paragraph with the actual message (not the icon)
  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    // Skip if it's empty or contains only the icon
    if (text && !p.querySelector('.icon')) {
      messageText = text;
    }
  });
  
  // Clear the block completely
  block.innerHTML = '';
  
  // Create the icon
  const icon = document.createElement('div');
  icon.className = 'thankyou-icon';
  icon.setAttribute('aria-hidden', 'true');
  
  // Create the message
  const message = document.createElement('div');
  message.className = 'thankyou-message';
  const messagePara = document.createElement('p');
  messagePara.textContent = messageText;
  message.appendChild(messagePara);
  
  // Assemble everything directly in block
  block.appendChild(icon);
  block.appendChild(message);
  
  // Style the page when this block is used
  document.body.style.background = 'linear-gradient(185deg, var(--color-gradient-purple) 0, var(--color-brand-pure-white) 300px)';
  document.body.style.backgroundAttachment = 'fixed';
  document.body.style.minHeight = '100vh';
  document.body.style.overflow = 'hidden';
  document.body.style.height = '100vh';
  
  // Hide footer
  const footer = document.querySelector('footer');
  if (footer) {
    footer.style.display = 'none';
  }
  
  // Make main full height and center content
  const main = document.querySelector('main');
  if (main) {
    main.style.minHeight = 'calc(100vh - var(--nav-height))';
    main.style.maxHeight = 'calc(100vh - var(--nav-height))';
    main.style.overflow = 'hidden';
    main.style.display = 'flex';
    main.style.flexDirection = 'column';
    main.style.justifyContent = 'center';
  }
  
  // Prevent scroll on html element
  document.documentElement.style.overflow = 'hidden';
  document.documentElement.style.height = '100vh';
}

