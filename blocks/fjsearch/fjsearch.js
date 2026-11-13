import { readBlockConfig } from '../../scripts/aem.js';
import { readReply, resolveEndpoint } from '../../scripts/knowledge-api.js';
import renderAnswer from '../../scripts/chat-answer.js';
import installChatWidget from '../../scripts/chat-widget.js';
import { appendSources } from '../ai-chat/ai-chat.js';
import decorateDocSearch from '../doc-search/doc-search.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const documents = element('div', 'doc-search homepage');
  const row = element('div', 'fjsearch-search');
  const source = element('a', '', 'Document index');
  source.href = new URL(config.source || '/docpages-index.json', window.location).href;
  row.append(source);
  if (config.faq) {
    const faq = element('a', '', 'FAQ');
    faq.href = new URL(config.faq, window.location).href;
    row.append(faq);
  }
  documents.append(row);
  block.replaceChildren(documents);
  await decorateDocSearch(documents);

  const form = documents.querySelector('form');
  const input = form.querySelector('input');
  input.maxLength = 500;
  input.enterKeyHint = 'search';
  form.querySelector('label').textContent = 'Search Tech Council';
  const submit = element('button', 'fjsearch-submit');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'AI search');
  submit.title = 'AI search';
  form.querySelector('svg').remove();
  form.insertBefore(submit, input);
  const help = element('p', 'fjsearch-help', 'Type to find resources. Press Enter for an AI answer.');
  help.id = `${input.id}-help`;
  input.setAttribute('aria-describedby', help.id);
  row.append(help);

  const panel = element('section', 'fjsearch-ai');
  panel.hidden = true;
  const heading = element('h2', 'fjsearch-heading', 'AI Search Results');
  heading.id = `${input.id}-answer`;
  heading.tabIndex = -1;
  panel.setAttribute('aria-labelledby', heading.id);
  const disclaimer = element('p', 'fjsearch-disclaimer', 'AI can make mistakes. Verify important information.');
  const status = element('p', 'fjsearch-status');
  status.setAttribute('role', 'status');
  const activity = element('div', 'ai-chat-activity');
  activity.setAttribute('aria-hidden', 'true');
  activity.append(element('span', ''), element('span', ''), element('span', ''));
  const answer = element('div', 'ai-chat-answer');
  const sources = element('div', 'fjsearch-sources');
  const stop = element('button', 'fjsearch-stop', 'Stop');
  stop.type = 'button';
  const continueChat = element('button', 'fjsearch-continue', 'Continue in chat');
  continueChat.type = 'button';
  continueChat.hidden = true;
  const actions = element('div', 'fjsearch-actions');
  actions.append(stop, continueChat);
  panel.append(heading, disclaimer, status, activity, answer, sources, actions);
  block.append(panel);
  block.dataset.mode = 'docs';
  block.dataset.state = 'idle';

  let active;
  let completed;
  let composing = false;
  const returnToDocuments = () => {
    active?.abort();
    active = null;
    completed = null;
    panel.hidden = true;
    continueChat.hidden = true;
    submit.disabled = false;
    block.dataset.mode = 'docs';
    block.dataset.state = 'idle';
  };
  input.addEventListener('input', returnToDocuments);
  form.addEventListener('reset', returnToDocuments);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  });
  documents.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (active || composing) return;
    const message = input.value.trim();
    if (message.length < 2) {
      input.setCustomValidity('Enter at least 2 characters for an AI answer.');
      input.reportValidity();
      return;
    }
    const controller = new AbortController();
    active = controller;
    completed = null;
    let text = '';
    let frame;
    let timedOut = false;
    const renderStream = () => {
      frame = null;
      if (active !== controller) return;
      renderAnswer(answer, text, []);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 140000);
    block.dataset.mode = 'ai';
    block.dataset.state = 'loading';
    panel.hidden = false;
    continueChat.hidden = true;
    stop.hidden = false;
    activity.hidden = false;
    submit.disabled = true;
    heading.textContent = 'AI Search Results';
    answer.replaceChildren();
    sources.replaceChildren();
    status.textContent = 'Looking through Tech Council knowledge...';
    heading.focus();
    try {
      const response = await fetch(resolveEndpoint(config.endpoint, '/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, history: [], limit: 6 }),
        signal: controller.signal,
      });
      const result = await readReply(response, (chunk) => {
        if (active !== controller || !chunk) return;
        text += chunk;
        activity.hidden = true;
        block.dataset.state = 'streaming';
        status.textContent = 'Receiving the answer...';
        if (frame == null) frame = requestAnimationFrame(renderStream);
      });
      if (active !== controller) return;
      if (typeof result.reply !== 'string' || !result.reply.trim() || !Array.isArray(result.sources)) {
        throw new Error('Invalid answer');
      }
      cancelAnimationFrame(frame);
      renderAnswer(answer, result.reply, result.sources);
      appendSources(sources, result.sources);
      if (result.meta?.mode === 'chat') {
        completed = { message, reply: result.reply, sources: result.sources };
        continueChat.hidden = false;
        status.textContent = 'Answer ready.';
      } else {
        heading.textContent = 'Resource Search Results';
        status.textContent = 'AI search is not configured. Here are matching resources.';
      }
      block.dataset.state = 'success';
    } catch {
      if (active !== controller) return;
      answer.replaceChildren();
      block.dataset.state = 'error';
      status.textContent = timedOut
        ? 'The answer took too long. Press Enter to retry, or edit your query for document results.'
        : 'AI search could not finish. Press Enter to retry, or edit your query for document results.';
      input.focus();
    } finally {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      if (active === controller) {
        active = null;
        activity.hidden = true;
        stop.hidden = true;
        submit.disabled = false;
      }
    }
  }, true);
  input.addEventListener('input', () => input.setCustomValidity(''));
  stop.addEventListener('click', () => {
    active?.abort();
    active = null;
    activity.hidden = true;
    stop.hidden = true;
    submit.disabled = false;
    block.dataset.state = 'stopped';
    status.textContent = 'Answer stopped. Press Enter to retry.';
    input.focus();
  });
  continueChat.addEventListener('click', async () => {
    if (!completed) return;
    const conversation = completed;
    continueChat.disabled = true;
    try {
      const open = await installChatWidget();
      const opened = await open(conversation);
      if (!opened) throw new Error('Chat did not open');
    } catch {
      status.textContent = 'Chat could not open. Please try again.';
    } finally {
      continueChat.disabled = false;
    }
  });
}
