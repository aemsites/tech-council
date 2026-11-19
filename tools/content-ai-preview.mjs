import http from 'node:http';

const port = 3003;
const preview = 'http://localhost:3002';
const upstream = 'https://4060142-techcouncilai.adobeioruntime.net/api/v1/web/content-ai/';
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

async function home(destination, response) {
  try {
    const result = await fetch(destination, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    let html = await result.text();
    if (result.ok && result.headers.get('content-type')?.includes('text/html')
      && !html.includes('name="content-ai-search-base-url"')) {
      const metadata = [
        `<meta name="content-ai-search-base-url" content="${upstream}">`,
        '<meta name="content-ai-search-source" content="tech-council">',
        '<meta name="content-ai-search-source-type" content="ACQUISITION">',
        '<meta name="content-ai-search-api-contract" content="tech-council">',
        '<meta name="content-ai-search-placeholder" content="Search Tech Council...">',
        '<meta name="content-ai-search-notice" content="Tech Council search preview. Do not enter personal or sensitive information. Verify AI answers with the linked sources.">',
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
  process.stdout.write(`Content AI local preview: http://localhost:${port}/ (also /search)\n`);
});
