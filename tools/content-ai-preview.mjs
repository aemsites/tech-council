import http from 'node:http';

const port = 3003;
const preview = 'http://localhost:3002';
const upstream = 'https://20092-274ochrelamprey.adobeioruntime.net/api/v1/web/content-ai';
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const routes = new Set(['/api/content-ai/search', '/api/content-ai/gensearch']);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function search(request, response, path) {
  if (request.method !== 'POST') {
    json(response, 405, { error: 'Use POST.' });
    return;
  }
  if ((request.headers.origin && !origins.has(request.headers.origin))
    || request.headers['sec-fetch-site'] === 'cross-site'
    || !request.headers['content-type']?.startsWith('application/json')) {
    json(response, 403, { error: 'Only same-origin JSON requests are allowed.' });
    return;
  }
  const chunks = [];
  let length = 0;
  try {
    // eslint-disable-next-line no-restricted-syntax
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 16384) {
        json(response, 413, { error: 'Request is too large.' });
        return;
      }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body.contentSource?.name !== 'frescopa' || body.contentSource?.type !== 'ACQUISITION') {
      json(response, 400, { error: 'This local demo only supports the Fréscopa sample source.' });
      return;
    }
    // No browser cookies, Authorization, or spoofed Origin are sent to the shared demo.
    const result = await fetch(`${upstream}/${path.split('/').pop()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
      redirect: 'error',
    });
    if (!result.ok) {
      json(response, result.status === 429 ? 429 : 502, { error: 'The shared demo service is unavailable.' });
      return;
    }
    json(response, 200, await result.json());
  } catch (error) {
    json(response, error instanceof SyntaxError ? 400 : 502, { error: 'The demo request could not be completed.' });
  }
}

async function home(destination, response) {
  try {
    const result = await fetch(destination, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    let html = await result.text();
    if (result.ok && result.headers.get('content-type')?.includes('text/html')
      && !html.includes('name="content-ai-search-base-url"')) {
      const metadata = [
        '<meta name="content-ai-search-base-url" content="/api/content-ai">',
        '<meta name="content-ai-search-source" content="frescopa">',
        '<meta name="content-ai-search-source-type" content="ACQUISITION">',
        '<meta name="content-ai-search-placeholder" content="Ask about coffee, brewing, or the Fréscopa stories">',
        '<meta name="content-ai-search-notice" content="Demo source: Fréscopa, not Tech Council. Queries go to a shared demo service. Do not enter internal or sensitive information.">',
      ].join('\n');
      html = html.replace(/<\/head>/i, `${metadata}</head>`);
    }
    const headers = Object.fromEntries(result.headers);
    ['content-length', 'content-encoding', 'transfer-encoding', 'etag'].forEach((key) => delete headers[key]);
    response.writeHead(result.status, { ...headers, 'cache-control': 'no-store' });
    response.end(html);
  } catch {
    json(response, 502, { error: 'Start the AEM preview on port 3002 first.' });
  }
}

const server = http.createServer((request, response) => {
  if (!origins.has(`http://${request.headers.host}`)) {
    json(response, 403, { error: 'Localhost access only.' });
    return;
  }
  const url = new URL(request.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/content-ai')) {
    if (routes.has(url.pathname)) search(request, response, url.pathname);
    else json(response, 404, { error: 'Unknown demo route.' });
    return;
  }
  if (url.pathname === '/search' || url.pathname === '/search/') {
    url.pathname = '/drafts/content-ai-search.html';
  }
  const destination = new URL(preview);
  destination.pathname = url.pathname;
  destination.search = url.search;
  if (['/', '/index', '/index.html'].includes(url.pathname) && request.method === 'GET') {
    home(destination, response);
    return;
  }
  const proxy = http.request(destination, {
    method: request.method,
    headers: { ...request.headers, host: destination.host },
  }, (result) => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  proxy.on('error', () => {
    if (!response.headersSent) json(response, 502, { error: 'Start the AEM preview on port 3002 first.' });
    else response.destroy();
  });
  request.pipe(proxy);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Content AI local preview: http://localhost:${port}/search\n`);
});
