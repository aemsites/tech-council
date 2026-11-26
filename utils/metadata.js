const pageMetadata = new WeakMap();

function text(value) {
  if (value == null || value === 0 || value === '0') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function metadataList(value) {
  const items = Array.isArray(value) ? value : text(value).split(/[,;|]/);
  const seen = new Set();
  return items.map(text).filter((item) => {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function metadataDate(value, excel = false) {
  const input = text(value);
  if (!input) return '';
  if (excel && /^\d+(?:\.\d+)?$/.test(input)) {
    const date = new Date((Math.floor(Number(input)) - 25569) * 86400000);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1000
      && date.getUTCFullYear() <= 9999 ? date.toISOString().slice(0, 10) : '';
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input)
    || !Number.isFinite(Date.parse(input))) return '';
  const day = input.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === day ? day : '';
}

function readMeta(doc, key) {
  const attribute = key.startsWith('og:') ? 'property' : 'name';
  return text(doc.head.querySelector(`meta[${attribute}="${key}"]`)?.content);
}

function setMeta(doc, key, value, overwrite = false) {
  const attribute = key.startsWith('og:') ? 'property' : 'name';
  const matches = [...doc.head.querySelectorAll(`meta[${attribute}="${key}"]`)];
  if (!overwrite && matches.some((meta) => text(meta.content))) return;
  const content = text(value);
  if (!content) {
    if (overwrite) matches.forEach((meta) => meta.remove());
    return;
  }
  const meta = matches.shift() || doc.createElement('meta');
  meta.setAttribute(attribute, key);
  meta.content = content;
  if (!meta.isConnected) doc.head.append(meta);
  matches.forEach((duplicate) => duplicate.remove());
}

function safeUrl(value, base) {
  if (!text(value)) return '';
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : '';
  } catch {
    return '';
  }
}

export function canonicalPageUrl(input = window.location.href) {
  const url = new URL(input);
  url.hash = '';
  if (url.pathname === '/recordings') {
    const talk = text(url.searchParams.get('talk'));
    url.search = '';
    if (talk) url.searchParams.set('talk', talk);
  } else if (url.pathname === '/communities/details') {
    const name = text(url.searchParams.get('name'));
    url.search = '';
    if (name) url.searchParams.set('name', name);
  } else if (url.pathname === '/search') {
    url.search = '';
  } else {
    [...url.searchParams.keys()].forEach((key) => {
      if (/^(utm_.+|gclid|fbclid|highlight|t)$/i.test(key)) url.searchParams.delete(key);
    });
  }
  return url.href;
}

function pageDescription(doc) {
  const paragraph = [...doc.querySelectorAll('main p')].find((element) => (
    !element.closest('form, nav, [hidden], .recordings, .events, .content-ai-search, .dashboard')
    && text(element.textContent).length >= 40
  ));
  const content = text(paragraph?.textContent);
  if (content.length > 240) return `${content.slice(0, 237).replace(/\s+\S*$/, '')}...`;
  return content;
}

/** Fill shared defaults; block-provided facts take precedence over archive metadata. */
export default function updatePageMetadata(options = {}, doc = document) {
  const facts = { ...pageMetadata.get(doc), ...options };
  pageMetadata.set(doc, facts);
  const location = new URL(doc.URL);
  const title = text(facts.title) || text(doc.title) || readMeta(doc, 'og:title')
    || text(doc.querySelector('main h1, main h2')?.textContent) || 'Tech Council';
  const description = text(facts.description) || readMeta(doc, 'description')
    || readMeta(doc, 'og:description') || pageDescription(doc)
    || `${title}: technical knowledge and collaboration from Adobe Tech Council.`;
  doc.title = title;

  let canonical = doc.head.querySelector('link[rel="canonical"]');
  const url = safeUrl(facts.canonical, location.href)
    || safeUrl(canonical?.getAttribute('href'), location.href) || canonicalPageUrl(location);
  if (!canonical) {
    canonical = doc.createElement('link');
    canonical.rel = 'canonical';
    doc.head.append(canonical);
  }
  canonical.href = url;
  doc.head.querySelectorAll('link[rel="canonical"]').forEach((link) => {
    if (link !== canonical) link.remove();
  });

  const tags = metadataList(facts.tags ?? readMeta(doc, 'tags'));
  const category = text(facts.category ?? readMeta(doc, 'category'));
  const speakers = metadataList(facts.speakers ?? readMeta(doc, 'speakers'));
  const keywords = metadataList(facts.keywords ?? (readMeta(doc, 'keywords')
    || [title.replace(/\s*\|\s*Recordings$/, ''), category, ...tags, ...speakers]));
  [
    ['description', description, Boolean(facts.description)],
    ['og:title', title, Boolean(facts.title)],
    ['og:description', description, Boolean(facts.description)],
    ['og:url', url, true],
    ['og:type', facts.ogType || 'website', Boolean(facts.ogType)],
    ['og:site_name', 'Tech Council'],
    ['twitter:card', readMeta(doc, 'og:image') ? 'summary_large_image' : 'summary'],
    ['twitter:title', title, Boolean(facts.title)],
    ['twitter:description', description, Boolean(facts.description)],
    ['twitter:image', readMeta(doc, 'og:image')],
    ['keywords', keywords.join(', '), facts.keywords !== undefined],
    ['speakers', speakers.join(', '), facts.speakers !== undefined],
    ['tags', tags.join(', '), facts.tags !== undefined],
    ['category', category, facts.category !== undefined],
    ['recording-date', facts.recordingDate, facts.recordingDate !== undefined],
    ['content-type', facts.contentType || 'page', Boolean(facts.contentType)],
  ].forEach(([key, value, overwrite]) => setMeta(doc, key, value, overwrite));

  const language = doc.documentElement.lang || 'en';
  const type = facts.pageType || (['/recordings', '/events', '/resources', '/communities', '/communities/']
    .includes(location.pathname) ? 'CollectionPage' : 'WebPage');
  const webpage = {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: language,
    isPartOf: { '@id': `${location.origin}/#website` },
  };
  if (keywords.length) webpage.keywords = keywords;
  if (tags.length) webpage.about = tags.map((name) => ({ '@type': 'Thing', name }));
  if (category) webpage.genre = category;
  const image = safeUrl(readMeta(doc, 'og:image'), location.href);
  if (image) webpage.primaryImageOfPage = { '@type': 'ImageObject', url: image };
  const published = metadataDate(readMeta(doc, 'publication-date'));
  if (published && facts.contentType !== 'recording') webpage.datePublished = published;
  if (facts.recordingDate) webpage.dateCreated = facts.recordingDate;
  if (facts.entity) webpage.mainEntity = facts.entity;
  const graph = [{
    '@type': 'WebSite',
    '@id': `${location.origin}/#website`,
    url: `${location.origin}/`,
    name: 'Tech Council',
    inLanguage: language,
  }, webpage];

  let schema = doc.head.querySelector('script[data-tech-council-metadata]');
  if (!schema) {
    schema = doc.createElement('script');
    schema.type = 'application/ld+json';
    schema.setAttribute('data-tech-council-metadata', '');
    schema.setAttribute('nonce', 'aem');
    doc.head.append(schema);
  }
  schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/</g, '\\u003c');
}
