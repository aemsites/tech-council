import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';

function dom() {
  const { window, document } = parseHTML('<html><head></head><body><main></main></body></html>');
  window.location = new URL('https://techcouncil.corp.adobe.com/');
  globalThis.window = window;
  globalThis.document = document;
  globalThis.requestAnimationFrame = (callback) => setImmediate(callback);
  globalThis.cancelAnimationFrame = (frame) => clearImmediate(frame);
  return { window, document };
}

dom();
const { default: decorateChat } = await import('../blocks/ai-chat/ai-chat.js');
const { default: decorateSearch } = await import('../blocks/backend-search/backend-search.js');
const { default: installChatWidget } = await import('../scripts/chat-widget.js');
const { default: renderAnswer } = await import('../scripts/chat-answer.js');
const { readEvents, resolveEndpoint, sitePath } = await import('../scripts/knowledge-api.js');
const tick = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chatBlock(t, fetchImpl) {
  dom();
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  t.after(() => { globalThis.fetch = original; });
  const block = document.createElement('div');
  block.className = 'ai-chat';
  document.querySelector('main').append(block);
  decorateChat(block);
  const input = block.querySelector('textarea');
  const form = block.querySelector('form');
  const submit = (text) => {
    input.value = text;
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  };
  form.requestSubmit = () => form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  return { block, input, submit };
}

const reply = {
  reply: '**MCP** [Community](/communities/mcp) [Document](https://adobe.sharepoint.com/document)\n\n'
    + '[Wiki page](/spaces/WEM/pages/1/MCP) [Unverified page](/unknown-topic)\n\n<img src=x onerror=alert(1)>',
  sources: [
    { title: 'MCP community', url: '/communities/mcp' },
    { title: 'Duplicate', url: '/communities/mcp' },
    { title: 'Private document', url: 'https://adobe.sharepoint.com/document' },
  ],
  meta: { mode: 'chat', provider: 'fluffyjaws' },
};

function sse(result = reply) {
  return new Response(`event: token\ndata: ${JSON.stringify({ text: 'MCP' })}\n\nevent: done\ndata: ${JSON.stringify(result)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function floatingChat() {
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
  const installed = installChatWidget();
  document.querySelector('link').onload();
  await installed;
  const launcher = document.querySelector('.chat-launcher');
  assert.equal(document.querySelector('dialog'), null);
  launcher.click();
  document.querySelectorAll('link').forEach((link) => link.onload());
  await tick();
  return { launcher, dialog: document.querySelector('dialog') };
}

test('floating chat is lazy, unique, and preserves completed conversation when reopened', async (t) => {
  const { input: inlineInput } = chatBlock(t, async () => sse());
  const { launcher, dialog } = await floatingChat();
  await installChatWidget();
  assert.equal(document.querySelectorAll('.chat-launcher').length, 1);
  assert.equal(launcher.getAttribute('aria-expanded'), 'true');
  assert.equal(launcher.getAttribute('aria-label'), 'Open Tech Council assistant');
  assert.equal(launcher.textContent, '');
  assert.equal(dialog.querySelector('.chat-dialog-close').getAttribute('aria-label'), 'Close chat');
  assert.equal(dialog.getAttribute('aria-labelledby'), dialog.querySelector('h2').id);
  const input = dialog.querySelector('textarea');
  assert.notEqual(input.id, inlineInput.id);
  input.value = 'What is MCP?';
  dialog.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(dialog.querySelector('.ai-chat').dataset.state, 'success');
  dialog.querySelector('.chat-dialog-close').click();
  assert.equal(launcher.getAttribute('aria-expanded'), 'false');
  assert.equal(dialog.hasAttribute('open'), false);
  launcher.click();
  await tick();
  assert.equal(dialog.hasAttribute('open'), true);
  assert.equal(dialog.querySelectorAll('.ai-chat-message').length, 2);
});

test('closing floating chat cancels its request without losing the next draft', async (t) => {
  let signal;
  chatBlock(t, (url, options) => {
    ({ signal } = options);
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const { dialog } = await floatingChat();
  const input = dialog.querySelector('textarea');
  input.value = 'Find AI sessions';
  dialog.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  input.value = 'My next draft';
  dialog.close();
  await tick();
  assert.equal(signal.aborted, true);
  assert.equal(input.value, 'My next draft');
  assert.equal(dialog.querySelectorAll('.ai-chat-message').length, 0);
  assert.equal(dialog.querySelector('.ai-chat-retry').hidden, false);
});

test('API URLs stay same-origin by default and foreign source links are rejected', () => {
  dom();
  assert.equal(resolveEndpoint('', '/api/chat'), 'https://techcouncil.corp.adobe.com/api/chat');
  assert.throws(() => resolveEndpoint('http://external.example/chat', '/api/chat'));
  assert.equal(sitePath('https://techcouncil.corp.adobe.com//evil.example/events'), '/evil.example/events');
  assert.equal(sitePath('//evil.example/events'), null);
  assert.equal(sitePath('https://adobe.sharepoint.com/document'), null);
  assert.equal(sitePath('https://techcouncil.corp.adobe.com.evil.example/events'), null);
});

test('only the exact v2 EDS previews use the corporate API by default', () => {
  dom();
  for (const suffix of ['live', 'page']) {
    window.location = new URL(`https://v2--tech-council--aemsites.aem.${suffix}/resources`);
    assert.equal(resolveEndpoint('', '/api/chat'), 'https://techcouncil.corp.adobe.com/api/chat');
    assert.equal(resolveEndpoint('/api/search', '/api/search'), 'https://techcouncil.corp.adobe.com/api/search');
    assert.equal(resolveEndpoint('https://approved.example/chat', '/api/chat'), 'https://approved.example/chat');
    assert.throws(() => resolveEndpoint('http://external.example/chat', '/api/chat'));
  }
  for (const origin of [
    'https://main--tech-council--aemsites.aem.live',
    'https://v2--tech-council--aemsites.aem.live.evil.example',
    'http://localhost:8081',
  ]) {
    window.location = new URL(`${origin}/`);
    assert.equal(resolveEndpoint('', '/api/chat'), `${origin}/api/chat`);
  }
});

test('event reader handles fragmented UTF-8, CRLF and a final frame without a blank line', async () => {
  const bytes = new TextEncoder().encode('event: token\r\ndata: {"text":"日本語"}\r\n');
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const events = [];
  for await (const event of readEvents(body)) events.push(event);
  assert.deepEqual(events, [{ event: 'token', data: '{"text":"日本語"}' }]);
});

test('chat renders safe streamed answers and sends completed exchanges on follow-up', async (t) => {
  const calls = [];
  const { block, submit } = chatBlock(t, async (url, options) => {
    calls.push({ url, options });
    return sse();
  });
  const log = block.querySelector('.ai-chat-log');
  Object.defineProperty(log, 'scrollHeight', {
    get: () => (log.querySelector('.ai-chat-sources') ? 1000 : 100),
  });
  submit('  What is MCP?  ');
  await tick();
  assert.equal(block.dataset.state, 'success');
  assert.equal(calls[0].url, 'https://techcouncil.corp.adobe.com/api/chat');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { message: 'What is MCP?', history: [], limit: 6 });
  assert.equal(block.querySelectorAll('.ai-chat-sources a').length, 1);
  assert.equal(log.scrollTop, 1000);
  assert.equal(block.querySelector('.ai-chat-answer img'), null);
  assert.equal(block.querySelector('a[href*="sharepoint"]'), null);
  assert.equal(block.querySelector('a[href^="/spaces/"]'), null);
  assert.equal(block.querySelector('a[href="/unknown-topic"]'), null);
  assert.ok(block.querySelector('.ai-chat-answer').textContent.includes('Wiki page'));
  assert.ok(block.querySelector('.ai-chat-answer').textContent.includes('<img'));
  assert.equal(block.querySelector('.ai-chat-source-disclosure').hasAttribute('open'), false);
  submit('Which sessions cover it?');
  await tick();
  assert.deepEqual(JSON.parse(calls[1].options.body).history, [
    { role: 'user', content: 'What is MCP?' },
    { role: 'assistant', content: reply.reply },
  ]);
});

test('waiting feedback becomes real incremental text before completion and controls stay accessible', async (t) => {
  let stream;
  const { block, submit } = chatBlock(t, async () => new Response(new ReadableStream({
    start(controller) { stream = controller; },
  }), { headers: { 'Content-Type': 'text/event-stream' } }));
  const frame = (event, data) => stream.enqueue(
    new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
  );
  const send = block.querySelector('.ai-chat-send');
  const stop = block.querySelector('.ai-chat-stop');
  assert.equal(send.getAttribute('aria-label'), 'Send');
  assert.equal(send.textContent, '');
  assert.equal(stop.getAttribute('aria-label'), 'Stop');
  assert.equal(block.querySelector('.ai-chat-reset').getAttribute('aria-label'), 'New chat');
  submit('What is MCP?');
  await tick();
  assert.equal(block.dataset.state, 'loading');
  assert.equal(block.querySelector('.ai-chat-activity').hidden, false);
  assert.equal(block.querySelector('.ai-chat-activity').children.length, 3);
  assert.equal(send.hidden, true);
  assert.equal(stop.hidden, false);
  frame('token', { text: '' });
  await tick();
  assert.equal(block.dataset.state, 'loading');
  frame('token', { text: '**MCP' });
  await tick();
  assert.equal(block.querySelector('.ai-chat-answer').textContent, '**MCP');
  frame('token', { text: '** connects' });
  await tick();
  assert.equal(block.dataset.state, 'streaming');
  assert.equal(block.querySelector('.ai-chat-activity').hidden, true);
  assert.equal(block.querySelector('.ai-chat-answer').textContent, 'MCP connects');
  assert.equal(block.querySelector('.ai-chat-answer strong').textContent, 'MCP');
  assert.equal(block.querySelector('.ai-chat-answer p').textContent, 'MCP connects');
  assert.ok(block.querySelector('.is-streaming'));
  frame('token', { text: ' tools.' });
  await tick();
  assert.equal(block.querySelector('.ai-chat-answer').textContent, 'MCP connects tools.');
  frame('done', { reply: 'MCP connects tools.', sources: [], meta: { mode: 'chat' } });
  stream.close();
  await tick();
  assert.equal(block.dataset.state, 'success');
  assert.equal(block.querySelector('.ai-chat-activity'), null);
  assert.equal(block.querySelector('.is-streaming'), null);
  assert.equal(send.hidden, false);
  assert.equal(stop.hidden, true);
});

test('answers render structured Markdown, nested emphasis, readable verified links and code', () => {
  dom();
  const answer = document.createElement('div');
  renderAnswer(answer, [
    '### Sessions and related discussion',
    '',
    '- **Code Mode** explains *authentication* and `MCP`.',
    '  - [**Session materials**](/recordings?highlight=MCP)',
    '- Visit https://techcouncil.corp.adobe.com/communities/mcp.',
    '',
    '3. Open the community.',
    '4. Read the guide.',
    '',
    '> Check the sources &amp; verify the dates.',
    '',
    '```js',
    'const example = "<script>alert(1)</script>";',
    '```',
    '',
    '| Topic | Resource |',
    '| --- | --- |',
    '| MCP | [Community](/communities/mcp) |',
  ].join('\n'), [
    { title: 'MCP recording', url: '/recordings?highlight=MCP' },
    { title: 'MCP community', url: '/communities/mcp' },
  ]);
  assert.equal(answer.querySelector('h3').textContent, 'Sessions and related discussion');
  assert.equal(answer.querySelectorAll('ul > li').length, 3);
  assert.equal(answer.querySelector('ul ul a strong').textContent, 'Session materials');
  assert.equal(answer.querySelector('em').textContent, 'authentication');
  assert.equal(answer.querySelector('ol').start, 3);
  assert.equal(answer.querySelector('blockquote').textContent, 'Check the sources & verify the dates.');
  assert.equal(answer.querySelector('pre code').textContent, 'const example = "<script>alert(1)</script>";');
  assert.equal(answer.querySelector('pre').getAttribute('tabindex'), '0');
  assert.equal(answer.querySelector('script'), null);
  assert.equal(answer.querySelector('th').scope, 'col');
  assert.equal(answer.querySelectorAll('td').length, 2);
  assert.ok([...answer.querySelectorAll('a')].some((link) => link.textContent === 'MCP community'));
  assert.ok([...answer.querySelectorAll('a')].every((link) => link.getAttribute('href').startsWith('/')));
});

test('rich answers never inject HTML, tracking images, unsafe or unverified links', () => {
  dom();
  const answer = document.createElement('div');
  renderAnswer(answer, [
    '[Unsafe](javascript:alert(1))',
    '[Data](data:text/html,test)',
    '[Wiki page](/spaces/WEM/pages/123)',
    '[Private document](https://adobe.sharepoint.com/document)',
    '![Tracking image](https://external.example/pixel.png)',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://external.example"></iframe>',
  ].join('\n\n'), [
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'Private document', url: 'https://adobe.sharepoint.com/document' },
  ]);
  assert.equal(answer.querySelector('a, img, iframe, script'), null);
  assert.match(answer.textContent, /Private document/);
  assert.match(answer.textContent, /Tracking image/);
  assert.match(answer.textContent, /<img src=x onerror=alert\(1\)>/);
});

test('new chat cancels pending work and ignores a late answer without reusing context', async (t) => {
  const calls = [];
  let resolveFirst;
  const { block, submit } = chatBlock(t, (url, options) => {
    calls.push(options);
    if (calls.length === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return Promise.resolve(sse());
  });
  submit('First question');
  block.querySelector('.ai-chat-reset').click();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(block.querySelector('.ai-chat-activity'), null);
  resolveFirst(sse());
  await tick();
  assert.equal(block.querySelector('.ai-chat-log').children.length, 0);
  submit('New question');
  await tick();
  assert.deepEqual(JSON.parse(calls[1].body).history, []);
});

test('stop and retry preserve an edited draft and do not add an incomplete exchange', async (t) => {
  const calls = [];
  const { block, input, submit } = chatBlock(t, (url, options) => {
    calls.push(options);
    if (calls.length > 1) return Promise.resolve(sse());
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  });
  submit('Question to retry');
  input.value = 'My next draft';
  block.querySelector('.ai-chat-stop').click();
  await tick();
  assert.equal(block.querySelector('.ai-chat-activity'), null);
  assert.equal(block.querySelector('.ai-chat-send').hidden, false);
  block.querySelector('.ai-chat-retry').click();
  await tick();
  assert.equal(input.value, 'My next draft');
  assert.equal(block.dataset.state, 'success');
  assert.equal(JSON.parse(calls[1].body).message, 'Question to retry');
  assert.deepEqual(JSON.parse(calls[1].body).history, []);
});

test('truncated streams show a retry state and never enter conversation context', async (t) => {
  const calls = [];
  const { block, submit } = chatBlock(t, async (url, options) => {
    calls.push(options);
    if (calls.length > 1) return sse();
    return new Response('event: token\ndata: {"text":"unfinished"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
  submit('First question');
  await tick();
  assert.equal(block.dataset.state, 'error');
  assert.equal(block.querySelector('.ai-chat-retry').hidden, false);
  submit('Another question');
  await tick();
  assert.deepEqual(JSON.parse(calls[1].body).history, []);
});

test('IME confirmation and Shift+Enter never submit, while committed Enter does', async (t) => {
  const calls = [];
  const { input, block } = chatBlock(t, async (url, options) => {
    calls.push(options);
    return sse();
  });
  input.value = 'MCP question';
  const enter = (properties = {}) => {
    const event = new window.Event('keydown', { cancelable: true });
    Object.assign(event, { key: 'Enter', ...properties });
    input.dispatchEvent(event);
  };
  input.dispatchEvent(new window.Event('compositionstart'));
  enter();
  input.dispatchEvent(new window.Event('compositionend'));
  enter({ keyCode: 229 });
  enter({ shiftKey: true });
  assert.equal(calls.length, 0);
  enter();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(block.dataset.state, 'success');
});

test('search waits for three characters and renders only safe site results', async (t) => {
  dom();
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ results: reply.sources });
  };
  t.after(() => { globalThis.fetch = original; });
  const block = document.createElement('div');
  block.className = 'backend-search';
  document.querySelector('main').append(block);
  decorateSearch(block);
  const input = block.querySelector('input');
  const form = block.querySelector('form');
  form.requestSubmit = () => form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  input.value = 'MC';
  input.dispatchEvent(new window.Event('input'));
  await wait(330);
  assert.equal(calls.length, 0);
  input.value = 'MCP';
  input.dispatchEvent(new window.Event('input'));
  await wait(330);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://techcouncil.corp.adobe.com/api/search');
  assert.equal(block.querySelector('a[href*="sharepoint"]'), null);
  assert.equal(block.dataset.state, 'success');
});

test('search skeletons clear on reset and stale results cannot replace a newer query', async (t) => {
  dom();
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, options) => new Promise((resolve) => {
    calls.push({ options, resolve });
  });
  t.after(() => { globalThis.fetch = original; });
  const block = document.createElement('div');
  block.className = 'backend-search';
  document.querySelector('main').append(block);
  decorateSearch(block);
  const input = block.querySelector('input');
  const form = block.querySelector('form');
  const loading = block.querySelector('.backend-search-loading');
  const submit = (query) => {
    input.value = query;
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  };
  assert.equal(block.querySelector('.backend-search-clear').getAttribute('aria-label'), 'Clear search');
  submit('First topic');
  assert.equal(loading.hidden, false);
  assert.equal(loading.getAttribute('aria-hidden'), 'true');
  assert.equal(loading.children.length, 3);
  assert.equal(form.getAttribute('aria-busy'), 'true');
  form.dispatchEvent(new window.Event('reset'));
  assert.equal(loading.hidden, true);
  assert.equal(calls[0].options.signal.aborted, true);
  submit('Second topic');
  calls[1].resolve(Response.json({ results: [{ title: 'Second', url: '/events' }] }));
  await tick();
  assert.equal(loading.hidden, true);
  assert.equal(block.dataset.state, 'success');
  assert.equal(form.getAttribute('aria-busy'), 'false');
  calls[0].resolve(Response.json({ results: [{ title: 'Stale', url: '/resources' }] }));
  await tick();
  assert.equal(block.querySelectorAll('.backend-search-result').length, 1);
  assert.equal(block.querySelector('.backend-search-result-link').textContent, 'Second');
  submit('Third topic');
  calls[2].resolve(new Response('', { status: 503 }));
  await tick();
  assert.equal(loading.hidden, true);
  assert.equal(block.dataset.state, 'error');
  submit('No results');
  calls[3].resolve(Response.json({ results: [] }));
  await tick();
  assert.equal(loading.hidden, true);
  assert.equal(block.dataset.state, 'empty');
  assert.match(block.querySelector('.backend-search-status').textContent, /No matching results/);
});
