import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry, buildRegistryArtifacts, applyStatus } from '../scripts/build-registry.mjs';
import { checkRegistry, checkRegistryBundle } from '../scripts/check-registry.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { REPOSITORY } from '../scripts/lib.mjs';
import { releaseZip, writeRegistryFixtures, commit, tempDir, root } from './helpers/fixtures.mjs';

const generatedAt = '2025-02-01T00:00:00.000Z';

function registryVersion(overrides = {}) {
  return { version: '1.0.0', publishedAt: generatedAt, sourceCommit: commit, downloadUrl: `${REPOSITORY}/releases/download/test-skill-v1.0.0/test-skill-1.0.0.zip`, sha256: 'b'.repeat(64), size: 100, status: 'active', ...overrides };
}
function registryWith(version = registryVersion(), skill = {}) {
  return { schemaVersion: 1, generatedAt, repository: REPOSITORY, skills: [{ slug: 'test-skill', name: 'test-skill', description: 'A test skill.', category: 'developer-tools', tags: ['testing'], latest: '1.0.0', downloadUrl: version.downloadUrl, status: 'active', license: 'MIT', metadata: { category: 'developer-tools', tags: 'testing' }, versions: [version], ...skill }] };
}

test('registry builds multiple versions in descending order with deprecated/revoked status', async t => {
  const governance = { schemaVersion: 1, skills: { 'test-skill': { status: 'deprecated', statusReason: 'Superseded by a maintained alternative.', versions: { '1.0.0': 'deprecated', '2.0.0': 'revoked' } } } };
  const paths = await writeRegistryFixtures(t, [{ version: '1.0.0' }, { version: '2.0.0' }], governance);
  const registry = await buildRegistry({ ...paths, generatedAt });
  const skill = registry.skills[0];
  assert.deepEqual(skill.versions.map(v => [v.version, v.status]), [['2.0.0', 'revoked'], ['1.0.0', 'deprecated']]);
  assert.equal(skill.latest, '1.0.0');
  assert.equal(skill.category, 'developer-tools');
  assert.deepEqual(skill.tags, ['testing']);
  assert.equal(skill.downloadUrl, skill.versions[1].downloadUrl);
  assert.equal(skill.status, 'deprecated');
  await checkRegistry(registry);
});

test('fully revoked skill has history but no latest recommendation', () => {
  const state = applyStatus('test-skill', [{ version: '1.0.0', status: 'active' }], { skills: { 'test-skill': { status: 'revoked', statusReason: 'Security incident under investigation.', versions: { '1.0.0': 'revoked' } } } });
  assert.equal(state.status, 'revoked');
  assert.equal(Object.hasOwn(state, 'latest'), false);
  assert.equal(Object.hasOwn(state, 'downloadUrl'), false);
});

test('registry metadata follows latest regardless of release enumeration order', async t => {
  const windows = await releaseZip({ version: '1.0.0', manifest: { description: 'Old description.', platforms: ['windows'] } });
  const linux = await releaseZip({ version: '2.0.0', manifest: { description: 'Current description.', platforms: ['linux'] } });
  const forward = await writeRegistryFixtures(t, [{ version: '1.0.0', bytes: windows }, { version: '2.0.0', bytes: linux }]);
  const reverse = await writeRegistryFixtures(t, [{ version: '2.0.0', bytes: linux }, { version: '1.0.0', bytes: windows }]);
  const a = await buildRegistry({ ...forward, generatedAt });
  const b = await buildRegistry({ ...reverse, generatedAt });
  assert.equal(a.skills[0].latest, '2.0.0');
  assert.equal(a.skills[0].description, 'Current description.');
  assert.deepEqual(a.skills[0].platforms, ['linux']);
  assert.deepEqual(a, b);
});

test('registry builder rejects non-canonical URL and asset size mismatch', async t => {
  const badUrl = await writeRegistryFixtures(t, [{ fixture: { downloadUrl: 'https://example.invalid/file.zip' } }]);
  await assert.rejects(buildRegistry({ ...badUrl, generatedAt }), /non-canonical asset URL/);
  const bytes = await releaseZip();
  const badSize = await writeRegistryFixtures(t, [{ bytes, fixture: { size: bytes.length + 1 } }]);
  await assert.rejects(buildRegistry({ ...badSize, generatedAt }), /asset size mismatch/);
});

test('registry builder rejects orphan governance overrides', async t => {
  const missingSkill = await writeRegistryFixtures(t, [{ version: '1.0.0' }], { schemaVersion: 1, skills: { ghost: { status: 'deprecated', statusReason: 'No release exists.' } } });
  await assert.rejects(buildRegistry({ ...missingSkill, generatedAt }), /ghost: orphan governance override/);
  const missingVersion = await writeRegistryFixtures(t, [{ version: '1.0.0' }], { schemaVersion: 1, skills: { 'test-skill': { versions: { '2.0.0': 'revoked' } } } });
  await assert.rejects(buildRegistry({ ...missingVersion, generatedAt }), /test-skill@2\.0\.0: orphan governance override/);
});

test('registry builder rejects invalid embedded manifest', async t => {
  const bytes = await releaseZip({ manifest: { forbiddenRuntime: 'host-specific' } });
  const paths = await writeRegistryFixtures(t, [{ bytes }]);
  await assert.rejects(buildRegistry({ ...paths, generatedAt }), /manifest.*schema|additional properties/i);
});

test('registry checker rejects bad URL, hash, size, and manifest-derived metadata', async () => {
  await assert.rejects(checkRegistry(registryWith(registryVersion({ downloadUrl: 'https://example.invalid/a.zip' }))), /non-canonical URL/);
  await assert.rejects(checkRegistry(registryWith(registryVersion({ sha256: 'xyz' }))), /schema validation/);
  await assert.rejects(checkRegistry(registryWith(registryVersion({ size: 0 }))), /schema validation/);
  await assert.rejects(checkRegistry(registryWith(registryVersion(), { name: 'different' })), /duplicate or inconsistent slug/);
});

test('registry checker enforces Agent Skills naming constraints', async () => {
  for (const slug of ['bad--skill', 'bad-', 'claude-helper']) {
    const registry = registryWith(registryVersion(), { slug, name: slug });
    registry.skills[0].versions[0].downloadUrl = `${REPOSITORY}/releases/download/${slug}-v1.0.0/${slug}-1.0.0.zip`;
    await assert.rejects(checkRegistry(registry), /schema validation|reserved/i);
  }
});

test('registry checker enforces allowedTools spacing', async () => {
  for (const allowedTools of ['Read,Grep', 'Read\tGrep', 'Read  Grep']) {
    await assert.rejects(checkRegistry(registryWith(registryVersion(), { allowedTools })), /schema validation/);
  }
});

test('online checker verifies response and content length', async () => {
  const bytes = await releaseZip();
  const digest = createHash('sha256').update(bytes).digest('hex');
  const okFetch = async () => ({ ok: true, status: 200, headers: { get: key => key === 'content-length' ? String(bytes.length) : null }, arrayBuffer: async () => bytes });
  const registry = registryWith(registryVersion({ size: bytes.length, sha256: digest }));
  assert.equal(await checkRegistry(registry, { online: true, fetchImpl: okFetch }), true);
  const mismatch = async () => ({ ok: true, status: 200, headers: { get: () => String(bytes.length - 1) }, arrayBuffer: async () => bytes });
  await assert.rejects(checkRegistry(registry, { online: true, fetchImpl: mismatch }), /size mismatch/);
});


test('registry metadata and URL roll back to governance-selected latest', async t => {
  const old = await releaseZip({ version: '1.0.0', manifest: { category: 'data', tags: ['csv'], metadata: { category: 'data', tags: 'csv' } } });
  const current = await releaseZip({ version: '2.0.0', manifest: { category: 'media', tags: ['video'], metadata: { category: 'media', tags: 'video' } } });
  const governance = { schemaVersion: 1, skills: { 'test-skill': { latest: '1.0.0', versions: { '2.0.0': 'revoked' } } } };
  const paths = await writeRegistryFixtures(t, [{ version: '1.0.0', bytes: old }, { version: '2.0.0', bytes: current }], governance);
  const skill = (await buildRegistry({ ...paths, generatedAt })).skills[0];
  assert.equal(skill.latest, '1.0.0');
  assert.equal(skill.category, 'data');
  assert.deepEqual(skill.tags, ['csv']);
  assert.equal(skill.downloadUrl, skill.versions.find(v => v.version === '1.0.0').downloadUrl);
});

test('registry rejects unknown categories even on historical releases', async t => {
  const bytes = await releaseZip({ manifest: { category: 'unknown', metadata: { category: 'unknown', tags: 'testing' } } });
  const paths = await writeRegistryFixtures(t, [{ bytes }]);
  await assert.rejects(buildRegistry({ ...paths, generatedAt }), /unknown historical category/);
});

test('registry artifacts form a deterministic three-file bundle with counts and order', async t => {
  const paths = await writeRegistryFixtures(t, [{ version: '1.0.0' }]);
  const artifacts = await buildRegistryArtifacts({ ...paths, generatedAt });
  assert.deepEqual(Object.keys(artifacts), ['registry', 'categories', 'tags']);
  assert.equal(artifacts.categories.categories.length, 13);
  assert.deepEqual(artifacts.categories.categories.map(c => c.order), artifacts.categories.categories.map(c => c.order).toSorted((a, b) => a - b));
  assert.equal(artifacts.categories.categories.find(c => c.slug === 'developer-tools').skillCount, 1);
  assert.deepEqual(artifacts.tags.tags, [{ slug: 'testing', skillCount: 1 }]);
  assert.equal(artifacts.registry.generatedAt, generatedAt);
  assert.equal(artifacts.categories.generatedAt, generatedAt);
  assert.equal(artifacts.tags.generatedAt, generatedAt);

  const dir = await tempDir(t);
  await Promise.all(Object.entries(artifacts).map(([name, value]) => writeFile(path.join(dir, `${name}.json`), JSON.stringify(value))));
  assert.equal(await checkRegistryBundle(dir), true);
  artifacts.tags.tags[0].skillCount = 2;
  await writeFile(path.join(dir, 'tags.json'), JSON.stringify(artifacts.tags));
  await assert.rejects(checkRegistryBundle(dir), /tags do not match/);
  artifacts.tags.tags[0].skillCount = 1; artifacts.tags.generatedAt = '2025-03-01T00:00:00.000Z';
  await writeFile(path.join(dir, 'tags.json'), JSON.stringify(artifacts.tags));
  await assert.rejects(checkRegistryBundle(dir), /generatedAt/);
});

test('online checker downloads and validates the actual release ZIP', async () => {
  const bytes = await releaseZip();
  const version = registryVersion({ size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  const fetchImpl = async url => ({ ok: true, status: 200, headers: { get: key => key === 'content-length' ? String(bytes.length) : null }, arrayBuffer: async () => bytes });
  assert.equal(await checkRegistry(registryWith(version), { online: true, fetchImpl }), true);
});
