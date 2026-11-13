const SOURCES = [
  ['/docpages-index.json', 'page'],
  ['/forms/events-form/events.json?sheet=events', 'event'],
  ['/forms/recording-form/recordings.json?sheet=recordings', 'recording'],
  ['/forms/tools-forms/tools.json?sheet=tools', 'resource'],
];
const STOP_WORDS = new Set('a an and are about can find for how i in is me of on or show tell the to what where which who with'.split(' '));

export class SearchError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function text(value, maxLength = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeResult(result) {
  const item = typeof result === 'string' ? { url: result } : result;
  if (!item || typeof item !== 'object') return null;
  const rawUrl = text(item.url, 2048);
  if (!rawUrl || (!rawUrl.startsWith('/') && !/^https?:\/\//i.test(rawUrl))) return null;
  let url;
  try {
    url = new URL(rawUrl, 'https://techcouncil.corp.adobe.com');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch {
    return null;
  }
  const type = ['page', 'community', 'event', 'recording', 'resource'].includes(item.type) ? item.type : 'page';
  const title = text(item.title, 200);
  const site = ['techcouncil.corp.adobe.com', 'techcouncilindia.corp.adobe.com'].includes(url.hostname)
    || /^[a-z0-9-]+--tech-council--aemsites\.aem\.(live|page)$/.test(url.hostname);
  const listing = { event: '/events', recording: '/recordings', resource: '/resources' }[type];
  if (!site && (!listing || !title)) return null;
  return {
    title: title || url.pathname,
    url: site ? `${url.pathname.replace(/^\/+/, '/')}${url.search}${url.hash}` : `${listing}?highlight=${encodeURIComponent(title)}`,
    description: text(item.description, 500),
    type,
  };
}

function tokenize(value) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function displayDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    return new Date((Number(raw) - 25569) * 86400000).toISOString().slice(0, 10);
  }
  return raw.slice(0, 10);
}

function mapDocument(row, type) {
  if (!row || String(row.robots || '').includes('noindex')) return null;
  let { path: url, description } = row;
  if (type === 'event' || type === 'recording') {
    const listing = type === 'event' ? '/events' : '/recordings';
    url = `${listing}?highlight=${encodeURIComponent(row.title || '')}`;
    description = [row.speaker, row.tag, displayDate(row.dateTime || row.date)].filter(Boolean).join(' | ');
  } else if (type === 'resource') {
    url = row.link;
  }
  const result = normalizeResult({
    title: row.title, url, description, type: row.path?.startsWith('/communities') ? 'community' : type,
  });
  if (!result || !text(row.title)) return null;
  const content = [row.content, row.tag, row.speaker, row.type].filter(Boolean).join(' ').replace(/<[^>]*>/g, ' ');
  return {
    ...result,
    titleWords: new Set(tokenize(result.title)),
    descriptionWords: new Set(tokenize(result.description)),
    contentWords: new Set(tokenize(content)),
  };
}

function rank(documents, query, limit) {
  const terms = [...new Set(tokenize(query).filter((term) => !STOP_WORDS.has(term)))];
  if (!terms.length) return [];
  const ranked = documents.map((document) => {
    let matched = 0;
    let score = 0;
    terms.forEach((term) => {
      const weight = (document.titleWords.has(term) ? 10 : 0)
        + (document.descriptionWords.has(term) ? 4 : 0)
        + (document.contentWords.has(term) ? 1 : 0);
      if (weight) matched += 1;
      score += weight;
    });
    if (document.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) score += 12;
    return { document, score: matched >= Math.ceil(terms.length / 2) ? score : 0 };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  const seen = new Set();
  return ranked.filter(({ document }) => {
    if (seen.has(document.url)) return false;
    seen.add(document.url);
    return true;
  }).slice(0, limit).map(({ document }) => ({
    title: document.title,
    url: document.url,
    description: document.description,
    type: document.type,
  }));
}

export function createSearch({
  contentOrigin = 'http://localhost:3001',
  agentUrl = '',
  agentToken = '',
  fetchImpl = fetch,
  timeoutMs = 10000,
  cacheMs = 60000,
} = {}) {
  let cached;
  let expires = 0;
  let loading;
  const loadDocuments = async () => {
    if (cached && Date.now() < expires) return cached;
    if (!loading) {
      loading = Promise.all(SOURCES.map(async ([path, type]) => {
        const response = await fetchImpl(new URL(path, contentOrigin), {
          signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
        });
        if (!response.ok) throw new Error('Index source unavailable');
        const json = await response.json();
        if (!Array.isArray(json.data)) throw new Error('Invalid index source');
        return json.data.map((row) => mapDocument(row, type)).filter(Boolean);
      })).then((sources) => {
        cached = sources.flat();
        expires = Date.now() + cacheMs;
        return cached;
      }).finally(() => { loading = undefined; });
    }
    return loading;
  };

  const search = async ({ query, limit }) => {
    try {
      if (!agentUrl) {
        return { results: rank(await loadDocuments(), query, limit), provider: 'index' };
      }
      const response = await fetchImpl(agentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agentToken ? { Authorization: `Bearer ${agentToken}` } : {}),
        },
        body: JSON.stringify({ query, limit }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Agent request failed');
      const json = await response.json();
      if (!Array.isArray(json.results)) throw new Error('Invalid agent response');
      const seen = new Set();
      const results = json.results.map(normalizeResult).filter((result) => {
        if (!result || seen.has(result.url)) return false;
        seen.add(result.url);
        return true;
      }).slice(0, limit);
      if (json.results.length && !results.length) throw new Error('No safe agent results');
      return { results, answer: text(json.answer, 4000), provider: 'agent' };
    } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new SearchError(504, 'SEARCH_TIMEOUT', 'Search took too long. Please try again.');
      }
      throw new SearchError(
        agentUrl ? 502 : 503,
        agentUrl ? 'AGENT_UNAVAILABLE' : 'INDEX_UNAVAILABLE',
        'Search is temporarily unavailable. Please try again.',
      );
    }
  };
  return search;
}
