import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRecordingCategory, getRecordingTags } from '../utils/recording-fields.js';

test('legacy tag remains a category, never a topic tag', () => {
  const row = { tag: ' Tech Talks ' };
  assert.equal(getRecordingCategory(row), 'Tech Talks');
  assert.deepEqual(getRecordingTags(row), []);
});

test('category and comma-separated tags remain independent', () => {
  const row = { category: ' MCP Community ', tag: 'Old category', tags: ' AI, MCP,, AI , mcp, C++ ' };
  assert.equal(getRecordingCategory(row), 'MCP Community');
  assert.deepEqual(getRecordingTags(row), ['AI', 'MCP', 'C++']);
});

test('an explicitly empty category does not restore a legacy category', () => {
  assert.equal(getRecordingCategory({ category: '', tag: 'Old category', tags: 'AI' }), '');
});

test('missing and Excel-empty fields do not become tags', () => {
  [undefined, null, '', '0', 0].forEach((value) => {
    assert.equal(getRecordingCategory({ category: value }), '');
    assert.deepEqual(getRecordingTags({ tags: value }), []);
  });
});
