import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const initial = parseHTML('<html><head></head><body></body></html>');
initial.window.location = new URL('https://techcouncil.corp.adobe.com/');
globalThis.window = initial.window;
globalThis.document = initial.document;
const { default: decorate } = await import('../blocks/fjsearch/fjsearch.js');

const tick = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = {
  reply: '**MCP** connects tools.',
  sources: [{ title: 'MCP recording', url: '/recordings?highlight=MCP' }],
  meta: { mode: 'chat' },
};

async function setup(t, answer) {
  const { window, document } = parseHTML('<html><head></head><body><main></main></body></html>');
  window.location = new URL('https://techcouncil.corp.adobe.com/');
  window.hlx = { codeBasePath: '' };
  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.DOMParser = window.DOMParser;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }

    observe() { this.callback([{ isIntersecting: true }]); }

    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
  globalThis.cancelAnimationFrame = (frame) => clearImmediate(frame);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/chat')) return answer(url, options);
    return Response.json({
      data: String(url).includes('recordings-data')
        ? [{ title: 'MCP recording', speaker: 'Speaker', tag: 'AI' }]
        : [{ title: 'MCP community', path: '/communities/mcp', content: 'Tools' }],
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const create = document.createElement.bind(document);
  document.createElement = (tag, ...args) => {
    const node = create(tag, ...args);
    if (tag === 'dialog') {
      node.showModal = () => node.setAttribute('open', '');
      node.close = () => {
        node.removeAttribute('open');
        node.dispatchEvent(new window.Event('close'));
      };
    }
    return node;
  };
  const block = document.createElement('div');
  block.className = 'fjsearch';
  document.querySelector('main').append(block);
  await decorate(block);
  await tick();
  const input = block.querySelector('input');
  input.setCustomValidity = () => {};
  input.reportValidity = () => {};
  const type = (value) => {
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const submit = () => block.querySelector('form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
  return {
    block, input, calls, type, submit,
  };
}

test('typing reuses Doc Search and its feeds without asking AI', async (t) => {
  const { block, calls, type } = await setup(t, () => {
    throw new Error('Typing must not call AI');
  });
  type('MCP');
  await wait(240);
  assert.ok(calls.some(({ url }) => url.includes('recordings-data.json')));
  assert.ok(calls.some(({ url }) => url.includes('events-data.json')));
  assert.equal(calls.some(({ url }) => url.endsWith('/api/chat')), false);
  assert.ok(block.querySelector('.doc-search-result').textContent.includes('MCP'));
  assert.equal(block.dataset.mode, 'docs');
  assert.equal(block.querySelector('.fjsearch-ai').hidden, true);
});

test('explicit submit streams formatted answers and continues the exchange in chat', async (t) => {
  let stream;
  const { block, calls, type, submit } = await setup(t, async () => {
    if (stream) return Response.json(result);
    return new Response(new ReadableStream({
      start(controller) { stream = controller; },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const frame = (event, data) => stream.enqueue(
    new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
  type('What is MCP?');
  submit();
  await tick();
  assert.equal(block.dataset.mode, 'ai');
  assert.equal(block.dataset.state, 'loading');
  assert.equal(block.querySelector('.fjsearch-continue').hidden, true);
  frame('token', { text: '**MCP** connects' });
  await tick();
  assert.equal(block.dataset.state, 'streaming');
  assert.equal(block.querySelector('.ai-chat-answer strong').textContent, 'MCP');
  frame('done', result);
  stream.close();
  await tick();
  assert.equal(block.dataset.state, 'success');
  assert.equal(block.querySelector('.fjsearch-continue').hidden, false);
  assert.equal(block.querySelector('.ai-chat-sources a').getAttribute('href'), result.sources[0].url);
  block.querySelector('.fjsearch-continue').click();
  await tick();
  document.querySelectorAll('link').forEach((link) => link.onload?.());
  await tick();
  document.querySelectorAll('link').forEach((link) => link.onload?.());
  await tick();
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(dialog.querySelectorAll('.ai-chat-message').length, 2);
  assert.equal(calls.filter(({ url }) => url.endsWith('/api/chat')).length, 1);
  dialog.querySelector('textarea').value = 'Which recording covers it?';
  dialog.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await tick();
  const requests = calls.filter(({ url }) => url.endsWith('/api/chat'));
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].options.body).history, [
    { role: 'user', content: 'What is MCP?' },
    { role: 'assistant', content: result.reply },
  ]);
});

test('editing cancels AI and ignores a late result; an error can be retried', async (t) => {
  let finish;
  let signal;
  let attempts = 0;
  const { block, type, submit } = await setup(t, (url, options) => {
    attempts += 1;
    ({ signal } = options);
    if (attempts === 1) return new Promise((resolve) => { finish = resolve; });
    if (attempts === 2) return Promise.resolve(new Response('', { status: 503 }));
    return Promise.resolve(Response.json(result));
  });
  type('What is MCP?');
  submit();
  await tick();
  type('AI sessions');
  assert.equal(signal.aborted, true);
  finish(Response.json(result));
  await tick();
  assert.equal(block.dataset.mode, 'docs');
  assert.equal(block.querySelector('.fjsearch-ai').hidden, true);
  submit();
  await tick();
  assert.equal(block.dataset.state, 'error');
  assert.equal(block.querySelector('.fjsearch-continue').hidden, true);
  submit();
  await tick();
  assert.equal(block.dataset.state, 'success');
});

test('resource-only fallback is not labeled AI and composition does not submit', async (t) => {
  const { block, input, calls, type, submit } = await setup(t, async () => Response.json({
    ...result, meta: { mode: 'search' },
  }));
  type('MCP');
  input.dispatchEvent(new window.Event('compositionstart'));
  submit();
  assert.equal(calls.some(({ url }) => url.endsWith('/api/chat')), false);
  input.dispatchEvent(new window.Event('compositionend'));
  submit();
  await tick();
  assert.equal(block.querySelector('.fjsearch-heading').textContent, 'Resource Search Results');
  assert.equal(block.querySelector('.fjsearch-continue').hidden, true);
  block.querySelector('form').dispatchEvent(new window.Event('reset', { bubbles: true }));
  assert.equal(block.dataset.mode, 'docs');
  assert.equal(block.querySelector('.fjsearch-ai').hidden, true);
});
