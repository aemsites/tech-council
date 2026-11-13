import { readBlockConfig } from '../../scripts/aem.js';
import { readReply, resolveEndpoint, sitePath } from '../../scripts/knowledge-api.js';
import renderAnswer from '../../scripts/chat-answer.js';

let count = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className, text) {
  const node = element('button', className);
  node.type = 'button';
  node.setAttribute('aria-label', text);
  node.title = text;
  return node;
}

export function appendSources(container, sources) {
  const list = element('ol', 'ai-chat-sources');
  const seen = new Set();
  sources.slice(0, 10).forEach((source) => {
    const path = sitePath(source?.url);
    if (!path || seen.has(path)) return;
    seen.add(path);
    const item = element('li');
    const link = element('a', '', source.title || 'Tech Council resource');
    link.href = path;
    item.append(link);
    list.append(item);
  });
  if (list.children.length) {
    const disclosure = element('details', 'ai-chat-source-disclosure');
    disclosure.append(element('summary', '', `${list.children.length} ${list.children.length === 1 ? 'source' : 'sources'}`), list);
    container.append(disclosure);
  }
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  count += 1;
  const id = `ai-chat-${count}`;
  const heading = element('h2', '', config.title || 'Tech Council');
  heading.id = `${id}-heading`;
  const reset = button('ai-chat-reset', 'New chat');
  reset.disabled = true;
  const header = element('div', 'ai-chat-header');
  const brand = element('img', 'ai-chat-brand');
  brand.src = `${window.hlx?.codeBasePath || ''}/icons/tc-logo.png`;
  brand.alt = '';
  brand.width = 32;
  brand.height = 32;
  header.append(brand, heading, reset);
  const welcome = element('div', 'ai-chat-welcome');
  const introduction = element('p', 'ai-chat-intro', 'What are you exploring?');
  const prompts = element('div', 'ai-chat-prompts');
  welcome.append(introduction, element('p', 'ai-chat-description', 'Find a session, explore a community, or go deeper on a topic.'), prompts);
  const log = element('div', 'ai-chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Conversation');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');
  log.tabIndex = 0;
  log.hidden = true;
  const form = element('form', 'ai-chat-form');
  form.method = 'post';
  form.action = '/api/chat';
  form.setAttribute('aria-labelledby', heading.id);
  const label = element('label', 'ai-chat-label', 'Your question');
  label.htmlFor = id;
  const help = element('p', 'ai-chat-help', '2-500 characters. Enter to send; Shift+Enter for a new line.');
  help.id = `${id}-help`;
  const input = element('textarea', 'ai-chat-input');
  input.id = id;
  input.name = 'message';
  input.rows = 1;
  input.required = true;
  input.minLength = 2;
  input.maxLength = 500;
  input.placeholder = 'Ask a question...';
  input.setAttribute('aria-describedby', `${help.id} ${id}-status`);
  const controls = element('div', 'ai-chat-controls');
  const submit = button('ai-chat-send', 'Send');
  submit.type = 'submit';
  const stop = button('ai-chat-stop', 'Stop');
  stop.hidden = true;
  const retry = button('ai-chat-retry', 'Retry question');
  retry.hidden = true;
  controls.append(submit, stop, retry);
  const composer = element('div', 'ai-chat-composer');
  composer.append(input, controls);
  form.append(label, help, composer);
  const status = element('p', 'ai-chat-status');
  status.id = `${id}-status`;
  status.setAttribute('role', 'status');
  const note = element('p', 'ai-chat-note', 'Check the sources before acting on an answer. Conversation clears on reload.');
  block.replaceChildren(header, welcome, log, form, status, note);
  block.dataset.state = 'idle';

  const turns = [];
  let active;
  let failed;
  let composing = false;
  const idleControls = () => {
    submit.disabled = false;
    submit.hidden = false;
    stop.hidden = true;
    form.setAttribute('aria-busy', 'false');
    log.setAttribute('aria-busy', 'false');
    log.hidden = !log.children.length;
    prompts.hidden = turns.length > 0;
    welcome.hidden = log.children.length > 0;
    reset.disabled = !turns.length && !failed;
  };
  const historyFor = (message) => {
    const history = turns.slice(-5).flatMap((turn) => [
      { role: 'user', content: turn.message },
      { role: 'assistant', content: turn.reply.slice(0, 4000) },
    ]);
    const payload = { message, history, limit: 6 };
    while (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 32768) {
      history.splice(0, 2);
    }
    return JSON.stringify(payload);
  };
  const send = async (message) => {
    if (active) return;
    if (message.length < 2 || message.length > 500) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Enter a question between 2 and 500 characters.';
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    const user = element('div', 'ai-chat-message ai-chat-user');
    user.append(element('p', 'ai-chat-speaker', 'You'), element('p', '', message));
    const assistant = element('div', 'ai-chat-message ai-chat-assistant');
    const answer = element('div', 'ai-chat-answer');
    const activity = element('div', 'ai-chat-activity');
    activity.setAttribute('aria-hidden', 'true');
    activity.append(element('span'), element('span'), element('span'));
    assistant.append(element('p', 'ai-chat-speaker', 'Tech Council'), activity, answer);
    log.append(user, assistant);
    log.hidden = false;
    log.setAttribute('aria-busy', 'true');
    prompts.hidden = true;
    welcome.hidden = true;
    submit.disabled = true;
    submit.hidden = true;
    reset.disabled = false;
    stop.hidden = false;
    retry.hidden = true;
    failed = null;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Looking into your question...';
    block.dataset.state = 'loading';
    log.scrollTop = log.scrollHeight;
    const controller = new AbortController();
    const request = {
      controller, message, user, assistant,
    };
    active = request;
    let timedOut = false;
    let streamedText = '';
    let renderFrame;
    const renderStream = () => {
      renderFrame = null;
      if (active !== request) return;
      renderAnswer(answer, streamedText, []);
      log.scrollTop = log.scrollHeight;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 140000);
    try {
      const endpoint = resolveEndpoint(config.endpoint, '/api/chat');
      form.action = endpoint;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: historyFor(message),
        signal: controller.signal,
      });
      const result = await readReply(response, (text) => {
        if (active !== request) return;
        if (!text) return;
        activity.hidden = true;
        assistant.classList.add('is-streaming');
        streamedText += text;
        if (renderFrame == null) renderFrame = requestAnimationFrame(renderStream);
        block.dataset.state = 'streaming';
        status.textContent = 'Receiving the answer...';
      });
      if (active !== request) return;
      if (typeof result.reply !== 'string' || !result.reply.trim() || !Array.isArray(result.sources)) {
        throw new Error('Chat returned an invalid answer.');
      }
      cancelAnimationFrame(renderFrame);
      activity.remove();
      assistant.classList.remove('is-streaming');
      renderAnswer(answer, result.reply, result.sources);
      if (result.meta?.mode !== 'chat') {
        assistant.append(element('span', 'ai-chat-mode', 'Resource search. AI chat is not configured.'));
      }
      appendSources(assistant, result.sources);
      log.scrollTop = log.scrollHeight;
      turns.push({ message, reply: result.reply });
      block.dataset.state = 'success';
      status.textContent = result.meta?.mode === 'chat'
        ? 'Answer ready. You can ask a follow-up.'
        : 'Matching resources ready. AI chat is not configured on this service.';
    } catch {
      if (active !== request) return;
      user.remove();
      assistant.remove();
      failed = message;
      retry.hidden = false;
      block.dataset.state = 'error';
      status.textContent = timedOut
        ? 'The assistant took too long. Retry your question.'
        : 'Chat could not finish this reply. Retry your question.';
    } finally {
      cancelAnimationFrame(renderFrame);
      clearTimeout(timer);
      if (active === request) {
        active = null;
        idleControls();
      }
    }
  };

  ['What is MCP?', 'Find AI sessions', 'Explore communities'].forEach((question) => {
    const suggestion = button('ai-chat-prompt', question);
    suggestion.textContent = question;
    suggestion.addEventListener('click', () => { send(question); });
    prompts.append(suggestion);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (active || composing) return;
    const message = input.value.trim();
    if (message.length >= 2 && message.length <= 500) input.value = '';
    send(message);
  });
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!composing && !event.isComposing && event.keyCode !== 229) form.requestSubmit();
  });
  stop.addEventListener('click', () => {
    if (!active) return;
    active.controller.abort();
    active.user.remove();
    active.assistant.remove();
    failed = active.message;
    active = null;
    retry.hidden = false;
    idleControls();
    block.dataset.state = 'idle';
    status.textContent = 'Response stopped. You can retry your question.';
    input.focus();
  });
  retry.addEventListener('click', () => { if (failed) send(failed); });
  const resetConversation = () => {
    active?.controller.abort();
    active = null;
    failed = null;
    turns.length = 0;
    composing = false;
    log.replaceChildren();
    input.value = '';
    retry.hidden = true;
    input.removeAttribute('aria-invalid');
    idleControls();
    block.dataset.state = 'idle';
    status.textContent = 'New conversation started.';
    input.focus();
  };
  reset.addEventListener('click', resetConversation);
  block.addEventListener('chat:continue', ({ detail }) => {
    if (typeof detail?.message !== 'string' || typeof detail.reply !== 'string'
      || !Array.isArray(detail.sources)) return;
    resetConversation();
    const user = element('div', 'ai-chat-message ai-chat-user');
    user.append(element('p', 'ai-chat-speaker', 'You'), element('p', '', detail.message));
    const assistant = element('div', 'ai-chat-message ai-chat-assistant');
    const answer = element('div', 'ai-chat-answer');
    renderAnswer(answer, detail.reply, detail.sources);
    assistant.append(element('p', 'ai-chat-speaker', 'Tech Council'), answer);
    appendSources(assistant, detail.sources);
    log.append(user, assistant);
    turns.push({ message: detail.message, reply: detail.reply });
    idleControls();
    block.dataset.state = 'success';
    log.scrollTop = log.scrollHeight;
    status.textContent = 'Search answer loaded. Ask a follow-up.';
  });
}
