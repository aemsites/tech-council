function fieldText(value) {
  return value == null || value === 0 || value === '0' ? '' : String(value).trim();
}

export function getRecordingCategory(row) {
  return fieldText(row.category ?? row.tag);
}

export function getRecordingTags(row) {
  const seen = new Set();
  return fieldText(row.tags).split(',').map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
