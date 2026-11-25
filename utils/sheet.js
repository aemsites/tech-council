export default function normalizeSheetRow(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
}
