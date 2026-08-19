import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import {
  schemaValidator, assertValid, parseArgs, isMain, loadCategoryTaxonomy, asciiCompare
} from './lib.mjs';
import { buildCategories, buildTags } from './build-registry.mjs';

const taxonomyCategories = taxonomy => Array.isArray(taxonomy) ? taxonomy : taxonomy.categories;
const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

async function validateSchema(name, value) {
  const validate = await schemaValidator(path.resolve(`schemas/${name}`));
  assertValid(validate, value, name.replace(/-v1\.schema\.json$/, ''));
}

export async function checkRegistry(registry, { online = false, fetchImpl = globalThis.fetch, taxonomyPath = 'taxonomy/categories.json' } = {}) {
  if (typeof registry === 'string') registry = await readJson(registry);
  await validateSchema('registry-v1.schema.json', registry);
  const taxonomy = await loadCategoryTaxonomy(taxonomyPath);
  const categories = new Set(taxonomyCategories(taxonomy).map(category => category.slug));
  const slugs = new Set();
  let previousSlug;
  for (const skill of registry.skills) {
    if (slugs.has(skill.slug) || skill.name !== skill.slug) throw new Error(`duplicate or inconsistent slug: ${skill.slug}`);
    if (previousSlug !== undefined && asciiCompare(previousSlug, skill.slug) >= 0) throw new Error('registry skills are not in ASCII slug order');
    previousSlug = skill.slug; slugs.add(skill.slug);
    if (!categories.has(skill.category)) throw new Error(`${skill.slug}: unknown category ${skill.category}`);
    const versions = new Set();
    const manifests = new Map();
    for (let index = 0; index < skill.versions.length; index++) {
      const v = skill.versions[index];
      if (versions.has(v.version) || !semver.valid(v.version)) throw new Error(`${skill.slug}: duplicate/invalid version ${v.version}`); versions.add(v.version);
      if (index && semver.rcompare(skill.versions[index - 1].version, v.version) > 0) throw new Error(`${skill.slug}: versions are not in descending SemVer order`);
      const expected = `${registry.repository}/releases/download/${skill.slug}-v${v.version}/${skill.slug}-${v.version}.zip`;
      if (v.downloadUrl !== expected) throw new Error(`${skill.slug}@${v.version}: non-canonical URL`);
      if (online) {
        const response = await fetchImpl(v.downloadUrl, { method: 'GET', redirect: 'follow' });
        if (!response.ok) throw new Error(`${v.downloadUrl}: HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const length = response.headers.get('content-length');
        if (length && Number(length) !== v.size) throw new Error(`${v.downloadUrl}: size mismatch`);
        if (bytes.length !== v.size) throw new Error(`${v.downloadUrl}: size mismatch`);
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (digest !== v.sha256) throw new Error(`${v.downloadUrl}: digest mismatch`);
        const zip = await JSZip.loadAsync(bytes);
        const entry = zip.file('manifest.json');
        if (!entry) throw new Error(`${skill.slug}@${v.version}: manifest missing`);
        const manifest = JSON.parse(await entry.async('string'));
        await validateSchema('skill-manifest.schema.json', manifest);
        if (manifest.slug !== skill.slug || manifest.name !== skill.name || manifest.version !== v.version) throw new Error(`${skill.slug}@${v.version}: release/manifest mismatch`);
        if (!categories.has(manifest.category)) throw new Error(`${skill.slug}@${v.version}: unknown historical category ${manifest.category}`);
        if (manifest.metadata.category !== manifest.category || manifest.metadata.tags !== manifest.tags.join(',')) throw new Error(`${skill.slug}@${v.version}: typed category/tags do not match raw metadata`);
        manifests.set(v.version, manifest);
      }
    }
    if (skill.latest === undefined) {
      if (skill.downloadUrl !== undefined || skill.status !== 'revoked' || skill.versions.some(v => v.status !== 'revoked')) throw new Error(`${skill.slug}: only a fully revoked skill may omit latest and downloadUrl`);
    } else {
      const latest = skill.versions.find(v => v.version === skill.latest);
      if (!latest || latest.status === 'revoked') throw new Error(`${skill.slug}: invalid latest`);
      if (skill.downloadUrl !== latest.downloadUrl) throw new Error(`${skill.slug}: top-level downloadUrl does not match latest`);
      if (online) {
        const manifest = manifests.get(skill.latest);
        for (const key of ['name', 'description', 'category']) if (skill[key] !== manifest[key]) throw new Error(`${skill.slug}: selected manifest ${key} mismatch`);
        if (!jsonEqual(skill.tags, manifest.tags)) throw new Error(`${skill.slug}: selected manifest tags mismatch`);
        for (const key of ['platforms', 'license', 'compatibility', 'metadata', 'allowedTools']) {
          if (!jsonEqual(skill[key], manifest[key])) throw new Error(`${skill.slug}: selected manifest ${key} mismatch`);
        }
      }
    }
  }
  return true;
}

export async function checkRegistryBundle(dir, options = {}) {
  const registry = await readJson(path.join(dir, 'registry.json'));
  const categories = await readJson(path.join(dir, 'categories.json'));
  const tags = await readJson(path.join(dir, 'tags.json'));
  await checkRegistry(registry, options);
  await validateSchema('categories-v1.schema.json', categories);
  await validateSchema('tags-v1.schema.json', tags);
  if (categories.generatedAt !== registry.generatedAt || tags.generatedAt !== registry.generatedAt) throw new Error('bundle generatedAt values do not match');
  const taxonomy = await loadCategoryTaxonomy(options.taxonomyPath ?? 'taxonomy/categories.json');
  const expectedCategories = buildCategories(registry, taxonomy);
  const expectedTags = buildTags(registry);
  if (!jsonEqual(categories, expectedCategories)) throw new Error('categories do not match taxonomy/order/active skill counts');
  if (!jsonEqual(tags, expectedTags)) throw new Error('tags do not match active skill counts/order');
  return true;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const options = { online: Boolean(args.online), taxonomyPath: args.taxonomy ?? 'taxonomy/categories.json' };
  const operation = args.dir ? checkRegistryBundle(args.dir, options) : checkRegistry(args.file ?? args._[0] ?? 'registry/v1/registry.json', options);
  operation.then(() => console.log('registry bundle valid')).catch(e => { console.error(e.message); process.exitCode = 1; });
}
