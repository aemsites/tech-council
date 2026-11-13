export function resolveEndpoint(endpoint, fallback) {
  const preview = [
    'https://v2--tech-council--aemsites.aem.live',
    'https://v2--tech-council--aemsites.aem.page',
  ].includes(window.location.origin);
  const base = preview ? 'https://techcouncil.corp.adobe.com' : window.location;
  const url = new URL(endpoint || fallback, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (window.location.protocol === 'https:' && url.protocol !== 'https:')) {
    throw new Error('Use a valid HTTPS API endpoint.');
  }
  return url.href;
}

export function sitePath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const site = url.origin === window.location.origin
      || ['techcouncil.corp.adobe.com', 'techcouncilindia.corp.adobe.com'].includes(url.hostname)
      || /^[a-z0-9-]+--tech-council--aemsites\.aem\.(live|page)$/.test(url.hostname);
    return site ? `${url.pathname.replace(/^\/+/, '/')}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

export async function* readEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data = [];
  let event = 'message';
  let size = 0;
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Read the stream in order.
      const { value, done } = await reader.read();
      if (value) size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('Response is too large.');
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (done && (buffer || data.length)) buffer += '\n\n';
      let end;
      // eslint-disable-next-line no-cond-assign -- Consume complete SSE lines.
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '');
        buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) yield { event, data: data.join('\n') };
          data = [];
          event = 'message';
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        }
      }

      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readReply(response, onText) {
  if (!response.ok) throw new Error('Chat is unavailable.');
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  // eslint-disable-next-line no-restricted-syntax -- Consume SSE without buffering the answer.
  for await (const event of readEvents(response.body)) {
    const data = JSON.parse(event.data);
    if (event.event === 'token' && typeof data.text === 'string') onText(data.text);
    if (event.event === 'done') return data;
    if (event.event === 'error') throw new Error('Chat could not finish this reply.');
  }
  throw new Error('Chat returned an incomplete reply.');
}
