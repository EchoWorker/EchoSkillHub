import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCategoryTaxonomy, schemaValidator, validateCategoryTaxonomy } from '../scripts/lib.mjs';
import { root, tempDir } from './helpers/fixtures.mjs';

const taxonomyPath = path.join(root, 'taxonomy/categories.json');
const schemaPath = path.join(root, 'schemas/category-taxonomy.schema.json');
const clone = value => structuredClone(value);

async function baseline() { return JSON.parse(await readFile(taxonomyPath, 'utf8')); }

async function loadMutation(t, mutate) {
  const value = await baseline();
  mutate(value);
  const dir = await tempDir(t);
  const file = path.join(dir, 'categories.json');
  await writeFile(file, JSON.stringify(value));
  return loadCategoryTaxonomy(file, schemaPath);
}

test('approved taxonomy satisfies its schema and contains exactly 13 ordered unique categories', async () => {
  const value = await baseline();
  const validate = await schemaValidator(schemaPath);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(validateCategoryTaxonomy(value), value);
  assert.equal(value.categories.length, 13);
  assert.equal(new Set(value.categories.map(c => c.slug)).size, 13);
  assert.equal(new Set(value.categories.map(c => c.order)).size, 13);
  assert.deepEqual(value.categories.map(c => c.order), value.categories.map(c => c.order).toSorted((a, b) => a - b));
});

test('taxonomy schema accepts count changes but rejects invalid shape', async t => {
  const smaller = await loadMutation(t, x => x.categories.pop());
  assert.equal(smaller.categories.length, 12);
  const larger = await loadMutation(t, x => x.categories.push({ slug: 'writing', name: 'Writing', nameZhCN: '写作', description: 'Writing and editorial workflows.', order: 140 }));
  assert.equal(larger.categories.length, 14);
  await assert.rejects(loadMutation(t, x => { x.categories[0].extra = true; }), /schema validation/);
  await assert.rejects(loadMutation(t, x => { delete x.categories[0].nameZhCN; }), /schema validation/);
  await assert.rejects(loadMutation(t, x => { x.schemaVersion = 2; }), /schema validation/);
});

test('taxonomy semantic validation rejects duplicate slugs and orders and non-increasing order', async () => {
  const value = await baseline();
  const duplicateSlug = clone(value); duplicateSlug.categories[1].slug = duplicateSlug.categories[0].slug;
  assert.throws(() => validateCategoryTaxonomy(duplicateSlug), /duplicate category slug/);
  const duplicateOrder = clone(value); duplicateOrder.categories[1].order = duplicateOrder.categories[0].order;
  assert.throws(() => validateCategoryTaxonomy(duplicateOrder), /duplicate category order/);
  const unsorted = clone(value); [unsorted.categories[0], unsorted.categories[1]] = [unsorted.categories[1], unsorted.categories[0]];
  assert.throws(() => validateCategoryTaxonomy(unsorted), /strictly increasing order/);
});
