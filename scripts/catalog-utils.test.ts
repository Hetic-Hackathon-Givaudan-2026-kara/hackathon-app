import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog, normalizeRecord } from './catalog-utils.js';

test('loads the configured catalog sources without duplicate references', () => {
  const { items } = loadCatalog();

  assert.ok(items.length > 0);
  assert.equal(new Set(items.map((item) => item.refCode)).size, items.length);
  assert.ok(items.every((item) => item.name && item.sensoryNotes));
});

test('rejects records without a reference code or name', () => {
  assert.throws(
    () =>
      normalizeRecord({
        name: 'Test',
        sensory_notes: 'sweet',
      }),
    /ref_code .* et un nom/u,
  );
});

test('rejects records without sensory notes', () => {
  assert.throws(
    () =>
      normalizeRecord({
        ref_code: 'test-1',
        name: 'Test',
      }),
    /aucune note sensorielle/u,
  );
});
