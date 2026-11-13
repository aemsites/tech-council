import { loadCSS } from './aem.js';

let openChat;

export default async function installChatWidget() {
  if (document.querySelector('.chat-launcher')) return openChat;
  const base = window.hlx?.codeBasePath || '';
  await loadCSS(`${base}/styles/chat-widget.css`);
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'chat-launcher';
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-label', 'Open Tech Council assistant');
  launcher.title = 'Open Tech Council assistant';
  const icon = document.createElement('span');
  icon.className = 'chat-launcher-icon';
  icon.setAttribute('aria-hidden', 'true');
  launcher.append(icon);
  const status = document.createElement('p');
  status.className = 'chat-widget-status';
  status.setAttribute('role', 'status');
  document.body.append(launcher, status);
  document.body.classList.add('has-chat-widget');

  let dialog;
  let opening = false;
  openChat = async (conversation) => {
    if (opening) return false;
    opening = true;
    status.textContent = '';
    launcher.setAttribute('aria-busy', 'true');
    try {
      if (!dialog) {
        const [{ default: decorate }] = await Promise.all([
          import('../blocks/ai-chat/ai-chat.js'),
          loadCSS(`${base}/blocks/ai-chat/ai-chat.css`),
        ]);
        const panel = document.createElement('dialog');
        panel.id = 'tech-council-chat';
        panel.className = 'chat-dialog';
        const block = document.createElement('div');
        block.className = 'ai-chat';
        decorate(block);
        panel.setAttribute('aria-labelledby', block.querySelector('h2').id);
        block.querySelector('textarea').autofocus = true;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'chat-dialog-close';
        close.setAttribute('aria-label', 'Close chat');
        close.title = 'Close chat';
        close.addEventListener('click', () => panel.close());
        block.querySelector('.ai-chat-header').append(close);
        panel.append(block);
        panel.addEventListener('close', () => {
          launcher.setAttribute('aria-expanded', 'false');
          const stop = panel.querySelector('.ai-chat-stop');
          if (!stop.hidden) stop.click();
        });
        document.body.append(panel);
        dialog = panel;
        launcher.setAttribute('aria-controls', panel.id);
      }
      dialog.showModal();
      if (conversation) {
        dialog.querySelector('.ai-chat').dispatchEvent(new CustomEvent('chat:continue', {
          detail: conversation,
        }));
      }
      launcher.setAttribute('aria-expanded', 'true');
      return true;
    } catch {
      status.textContent = 'Chat could not open. Please try again.';
      return false;
    } finally {
      opening = false;
      launcher.removeAttribute('aria-busy');
    }
  };
  launcher.addEventListener('click', () => openChat());
  return openChat;
}
