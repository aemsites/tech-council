import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createSearch, SearchError } from './search.mjs';

function readJSON(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8192) {
        reject(new SearchError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new SearchError(400, 'INVALID_JSON', 'Send a valid JSON request body.'));
      }
    });
    request.on('error', reject);
  });
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.query !== 'string' || body.query.trim().length < 2
    || body.query.trim().length > 500) {
    throw new SearchError(400, 'INVALID_QUERY', 'Enter a query between 2 and 500 characters.');
  }
  const limit = body.limit ?? 6;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new SearchError(400, 'INVALID_LIMIT', 'Limit must be an integer between 1 and 10.');
  }
  return { query: body.query.trim(), limit };
}

export default function createSearchServer({
  search = createSearch(),
  provider = 'index',
  allowedOrigins = ['http://localhost:3001', 'http://127.0.0.1:3001'],
} = {}) {
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Request-Id', requestId);
    const send = (status, data) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    };
    try {
      const { origin } = request.headers;
      if (origin && !allowedOrigins.includes(origin)) {
        throw new SearchError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.');
      }
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname === '/health' && request.method === 'GET') {
        send(200, { status: 'ok', provider });
        return;
      }
      if (pathname !== '/search') throw new SearchError(404, 'NOT_FOUND', 'Endpoint not found.');
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.writeHead(204);
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, OPTIONS');
        throw new SearchError(405, 'METHOD_NOT_ALLOWED', 'Use POST /search.');
      }
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
        throw new SearchError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json.');
      }
      const { query, limit } = validate(await readJSON(request));
      const start = performance.now();
      const result = await search({ query, limit });
      send(200, {
        query,
        ...(result.answer ? { answer: result.answer } : {}),
        results: result.results,
        meta: {
          provider: result.provider, requestId, durationMs: Math.round(performance.now() - start),
        },
      });
    } catch (error) {
      const expected = error instanceof SearchError;
      send(expected ? error.status : 500, {
        error: {
          code: expected ? error.code : 'INTERNAL_ERROR',
          message: expected ? error.message : 'Search could not be completed.',
        },
        requestId,
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agentUrl = process.env.SEARCH_AGENT_URL || '';
  const server = createSearchServer({
    search: createSearch({
      contentOrigin: process.env.SEARCH_CONTENT_ORIGIN || 'http://localhost:3001',
      agentUrl,
      agentToken: process.env.SEARCH_AGENT_TOKEN || '',
    }),
    provider: agentUrl ? 'agent' : 'index',
    allowedOrigins: (process.env.SEARCH_ALLOWED_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
  });
  const host = process.env.SEARCH_HOST || '127.0.0.1';
  const port = Number(process.env.SEARCH_PORT || 3002);
  server.listen(port, host, () => {
    process.stdout.write(`Search service ready at http://${host}:${port} (${agentUrl ? 'agent' : 'index'} provider)\n`);
  });
  const stop = () => { server.close(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
