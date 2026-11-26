export default function parseRecordingTime(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+(?::[0-5]\d){0,2}$/.test(value.trim())) return null;
  const seconds = value.trim().split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export function getRecordingTime(url) {
  const queryTime = parseRecordingTime(url.searchParams.get('t'));
  if (queryTime !== null) return queryTime;
  try {
    return parseRecordingTime(decodeURIComponent(url.hash.match(/^#t=(.+)$/)?.[1] || ''));
  } catch {
    return null;
  }
}
