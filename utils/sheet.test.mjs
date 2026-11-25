/* eslint-env node */
/* global globalThis */
import assert from 'node:assert/strict';
import test from 'node:test';
import normalizeSheetRow from './sheet.js';

test('lowercases every header without changing values or input', () => {
  const row = Object.freeze({
    TITLE: 'AI Harnesses: From Development to Production Triage',
    Speaker: 'Yatin, Aryant, Shriyant',
    RECORDINGLINK: 'https://example.com/Recording',
    PresentationLink: '',
    DATE: 46331,
    TAG: 'AI Builder Talk',
    EMBEDURL: 'https://example.com/Embed',
    Description: null,
    Summary: 'fragments/tech-talks-summary/ai_harnesses/ai-summary',
    TrAnScRiPt: 'fragments/tech-talks-summary/ai_harnesses/transcripts',
    Comments: 'Keep this field',
  });
  const normalized = normalizeSheetRow(row);

  assert.deepEqual(normalized, {
    title: row.TITLE,
    speaker: row.Speaker,
    recordinglink: row.RECORDINGLINK,
    presentationlink: '',
    date: 46331,
    tag: row.TAG,
    embedurl: row.EMBEDURL,
    description: null,
    summary: row.Summary,
    transcript: row.TrAnScRiPt,
    comments: row.Comments,
  });
  assert.equal(Object.hasOwn(row, 'summary'), false);
});

test('preserves lowercase fields, missing columns, and empty values', () => {
  const row = {
    title: 'Existing talk', summary: '', recordinglink: '0', count: 0, visible: false,
  };
  assert.deepEqual(normalizeSheetRow(row), row);
  assert.deepEqual(normalizeSheetRow({ title: 'No summary' }), { title: 'No summary' });
  assert.deepEqual(normalizeSheetRow({}), {});
});

test('normalizes arbitrary new column names without an allowlist', () => {
  assert.deepEqual(normalizeSheetRow({ 'NEW Column': 'MixedCase Value', CUSTOM_ID: 42 }), {
    'new column': 'MixedCase Value',
    custom_id: 42,
  });
});

test('preserves non-record entries so consumers can retain their existing handling', () => {
  [null, undefined, 'value', 0, false, ['value']].forEach((value) => {
    assert.equal(normalizeSheetRow(value), value);
  });
});

globalThis.window = {
  location: new URL('https://techcouncil.corp.adobe.com/?rum=off'),
  origin: 'https://techcouncil.corp.adobe.com',
};
globalThis.document = { querySelector: () => null };

const docSearch = await import('../blocks/doc-search/doc-search.js');
const search = await import('../blocks/search/search.js');
const { fetchPlaceholders } = await import('../scripts/placeholders.js');
const { default: DocBasedFormToAF } = await import('../blocks/form/transform.js');

function recase(row, casing) {
  return Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [casing === 'upper' ? key.toUpperCase() : key.toLowerCase(), value]));
}

['upper', 'lower'].forEach((casing) => {
  test(`both search readers normalize ${casing}case feed columns`, async (t) => {
    const recording = {
      Title: 'Harnesses',
      Speaker: 'Speaker',
      Date: '46331',
      Tag: 'AI',
      RecordingLink: 'https://example.com/Recording',
      PresentationLink: 'https://example.com/Slides',
    };
    const event = {
      Title: 'Event',
      Speaker: 'Speaker',
      DateTime: '2026-11-25T13:00:00Z',
      Tag: 'AI',
      MeetingRoom: 'Room One',
    };
    let rows;
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: rows })));

    rows = [recase(recording, casing)];
    const [recordingDoc] = await docSearch.fetchRecordingsData('/recordings.json');
    assert.equal(recordingDoc.title, 'Harnesses');
    assert.ok(recordingDoc.content.includes('https://example.com/recording'));
    assert.ok(recordingDoc.content.includes('https://example.com/slides'));

    rows = [recase(event, casing)];
    const [eventDoc] = await docSearch.fetchEventsData('/events.json');
    assert.equal(eventDoc.title, 'Event');
    assert.ok(eventDoc.content.includes('2026-11-25t13:00:00z'));
    assert.ok(eventDoc.content.includes('room one'));

    rows = [null, false, recase(event, casing)];
    assert.equal((await docSearch.fetchEventsData('/events.json')).length, 1);

    const indexRow = { Title: 'Page', Path: '/page', CustomColumn: 'KeepCase' };
    rows = [recase(indexRow, casing)];
    assert.deepEqual(await search.fetchData('/index.json'), [normalizeSheetRow(indexRow)]);
    window.docs = [];
    assert.deepEqual(
      (await docSearch.fetchSourceData('/index.json'))[0],
      normalizeSheetRow(indexRow),
    );
  });

  test(`placeholder ${casing}case headers preserve placeholder keys and text`, async (t) => {
    const rows = [recase({ Key: 'Previous Slide', Text: 'Previous Slide Label' }, casing)];
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: rows })));
    window.placeholders = {};
    assert.deepEqual(await fetchPlaceholders(), { previousSlide: 'Previous Slide Label' });
  });
});

test('form sheet columns normalize while field names, expressions, and output schema retain their case', () => {
  const rows = [
    {
      Id: 'Panel', Name: 'ContactDetails', Type: 'fieldset', Label: 'Contact details',
    },
    {
      Id: 'Name',
      Name: 'DisplayName',
      Type: 'text',
      Fieldset: 'ContactDetails',
      Label: 'Display Name',
      Value: 'KeepCase',
      ReadOnly: 'true',
      Mandatory: 'x',
      Max: '80',
      'Max Error Message': 'Too long',
      'Value Expression': 'OtherField',
      OptionNames: 'First Choice,Second Choice',
      Options: 'A,B',
    },
    {
      Id: 'Submit', Name: 'submit', Type: 'submit', Value: 'Thank You',
    },
  ];
  const transform = (data) => new DocBasedFormToAF().transform({ data });
  const expected = transform(rows);
  ['upper', 'lower'].forEach((casing) => {
    assert.deepEqual(transform(rows.map((row) => recase(row, casing))), expected);
  });
  const [panel] = expected.items;
  const [field] = panel.items;
  assert.equal(panel.name, 'ContactDetails');
  assert.equal(field.name, 'DisplayName');
  assert.equal(field.fieldType, 'text-input');
  assert.equal(field.value, 'KeepCase');
  assert.equal(field.readOnly, true);
  assert.equal(field.required, true);
  assert.equal(field.maxLength, '80');
  assert.equal(field.constraintMessages.maxLength, 'Too long');
  assert.deepEqual(field.enumNames, ['First Choice', 'Second Choice']);
  assert.deepEqual(expected.properties.rules.rules, [
    ['Name', [{ prop: 'value', expression: 'OtherField' }]],
  ]);
  assert.equal(expected.thankYouMsg, 'Thank You');
});

test('adaptive-form JSON bypasses spreadsheet header normalization', () => {
  const form = {
    adaptiveform: '0.10.0', items: [{ fieldType: 'text-input', name: 'DisplayName' }],
  };
  assert.deepEqual(new DocBasedFormToAF().transform(form), { formDef: form, excelData: null });
});
