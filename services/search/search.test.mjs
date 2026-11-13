import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearch, normalizeResult, SearchError } from './search.mjs';
import createSearchServer from './server.mjs';

async function serve(t, options = {}) {
  const server = createSearchServer(options);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, extra = {}) => fetch(`${base}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001' },
    body: JSON.stringify(body),
    ...extra,
  });
  return { base, post };
}

test('HTTP API validates and trims requests, returns stable result metadata and CORS', async (t) => {
  const calls = [];
  const { post } = await serve(t, {
    search: async (request) => {
      calls.push(request);
      return { results: [{ title: 'MCP', url: '/communities/mcp' }], provider: 'index' };
    },
  });
  const response = await post({ query: '  MCP  ', limit: 3 });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3001');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const json = await response.json();
  assert.equal(json.query, 'MCP');
  assert.equal(json.results[0].url, '/communities/mcp');
  assert.equal(json.meta.provider, 'index');
  assert.equal(json.meta.requestId, response.headers.get('x-request-id'));
  assert.deepEqual(calls, [{ query: 'MCP', limit: 3 }]);
});

test('invalid input, origins, media types and oversized requests never invoke search', async (t) => {
  const { post, base } = await serve(t, {
    search: () => { throw new Error('Invalid requests must not reach search'); },
  });
  await Promise.all([
    null, [], {}, { query: ' ' }, { query: 'x' }, { query: 'a'.repeat(501) },
    { query: 'AI', limit: 0 }, { query: 'AI', limit: 11 }, { query: 'AI', limit: '6' },
  ].map(async (body) => {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error.code);
  }));
  assert.equal((await post({ query: 'AI' }, { body: '{broken' })).status, 400);
  assert.equal((await post({ query: 'x'.repeat(9000) })).status, 413);
  assert.equal((await post({ query: 'AI' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const blocked = await post({ query: 'AI' }, {
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${base}/search`)).status, 405);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  const preflight = await fetch(`${base}/search`, {
    method: 'OPTIONS', headers: { Origin: 'http://localhost:3001' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

test('local provider ranks real source fields, excludes noindex pages, and caches feeds', async () => {
  let fetches = 0;
  const search = createSearch({
    fetchImpl: async (url) => {
      fetches += 1;
      const source = new URL(url).pathname;
      const rows = {
        '/docpages-index.json': [
          { path: '/communities/mcp', title: 'MCP community', content: 'Protocol authentication' },
          { path: '/draft', title: 'MCP secret', robots: 'noindex' },
        ],
        '/forms/events-form/events.json': [{ title: 'AI systems', speaker: 'Speaker', tag: 'Tech Talks' }],
        '/forms/recording-form/recordings.json': [
          { title: 'AI systems', recordingLink: 'https://video.example/session', date: '46269' },
        ],
        '/forms/tools-forms/tools.json': [
          { title: 'Agent debugger', description: 'MCP authentication', link: '/resources/debugger' },
        ],
      };
      return Response.json({ data: rows[source] });
    },
  });
  const result = await search({ query: 'MCP authentication', limit: 6 });
  assert.deepEqual(result.results.map((item) => item.url), ['/communities/mcp', '/resources/debugger']);
  const ai = await search({ query: 'AI', limit: 6 });
  assert.equal(ai.results.length, 2);
  assert.ok(ai.results.some((item) => item.url === '/recordings?highlight=AI%20systems'));
  assert.equal(ai.results.find((item) => item.type === 'recording').description, '2026-09-04');
  assert.equal(fetches, 4);
  assert.deepEqual((await search({ query: 'nothingmatching', limit: 6 })).results, []);
});

test('agent adapter forwards only the contract and keeps credentials server-side', async () => {
  let forwarded;
  const search = createSearch({
    agentUrl: 'https://agent.example/search',
    agentToken: 'test-only-token',
    fetchImpl: async (url, options) => {
      forwarded = { url, options };
      return Response.json({
        answer: 'Relevant sessions',
        results: [
          { title: 'MCP', url: '/communities/mcp', description: 'Protocol sessions' },
          '/communities/mcp',
          // eslint-disable-next-line no-script-url -- Untrusted result fixture; never executed.
          'javascript:alert(1)',
          { title: 'Recording', url: 'https://video.example/session', type: 'recording' },
        ],
      });
    },
  });
  const result = await search({ query: 'MCP', limit: 2 });
  assert.equal(forwarded.url, 'https://agent.example/search');
  assert.deepEqual(JSON.parse(forwarded.options.body), { query: 'MCP', limit: 2 });
  assert.equal(forwarded.options.headers.Authorization, 'Bearer test-only-token');
  assert.equal(forwarded.options.redirect, 'error');
  assert.equal(result.provider, 'agent');
  assert.equal(result.answer, 'Relevant sessions');
  assert.equal(result.results.length, 2);
  assert.equal(result.results[1].url, '/recordings?highlight=Recording');
  assert.ok(!JSON.stringify(result).includes('test-only-token'));
});

test('bad agent responses and timeouts produce controlled errors without index fallback', async () => {
  const invalid = createSearch({
    agentUrl: 'https://agent.example/search', fetchImpl: async () => Response.json({ wrong: [] }),
  });
  await assert.rejects(invalid({ query: 'AI', limit: 6 }), { status: 502, code: 'AGENT_UNAVAILABLE' });
  const timedOut = createSearch({
    agentUrl: 'https://agent.example/search',
    fetchImpl: async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; },
  });
  await assert.rejects(timedOut({ query: 'AI', limit: 6 }), { status: 504, code: 'SEARCH_TIMEOUT' });
  const missingIndex = createSearch({ fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(missingIndex({ query: 'AI', limit: 6 }), { status: 503, code: 'INDEX_UNAVAILABLE' });
});

test('URL results reject executable protocols and embedded credentials', () => {
  // eslint-disable-next-line no-script-url -- Untrusted result fixture; never executed.
  assert.equal(normalizeResult('javascript:alert(1)'), null);
  assert.equal(normalizeResult('not a url'), null);
  assert.equal(normalizeResult('data:text/html,hi'), null);
  assert.equal(normalizeResult('https://user:password@example.com'), null);
  assert.equal(normalizeResult('/recordings').url, '/recordings');
});

test('search destinations stay on Tech Council, including external provider records', () => {
  assert.equal(normalizeResult({
    title: 'MCP recording', url: 'https://adobe.sharepoint.com/video', type: 'recording',
  }).url, '/recordings?highlight=MCP%20recording');
  assert.equal(normalizeResult({
    title: 'Agent debugger', url: 'https://github.com/example/debugger', type: 'resource',
  }).url, '/resources?highlight=Agent%20debugger');
  assert.equal(normalizeResult('https://techcouncil.corp.adobe.com/communities/mcp#join').url, '/communities/mcp#join');
  assert.equal(normalizeResult('https://main--tech-council--aemsites.aem.live/events').url, '/events');
  assert.equal(normalizeResult('https://techcouncil.corp.adobe.com//unrelated.example/events').url, '/unrelated.example/events');
  assert.equal(normalizeResult('https://adobe.sharepoint.com/document'), null);
  assert.equal(normalizeResult('https://techcouncil.corp.adobe.com.evil.example/events'), null);
  assert.equal(normalizeResult('//unrelated.example/events'), null);
});

test('service errors do not expose upstream details', async (t) => {
  const { post } = await serve(t, {
    search: async () => { throw new SearchError(502, 'AGENT_UNAVAILABLE', 'Search unavailable.'); },
  });
  const response = await post({ query: 'AI' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'AGENT_UNAVAILABLE');
});
