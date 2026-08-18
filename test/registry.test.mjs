import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry, applyStatus } from '../scripts/build-registry.mjs';
import { checkRegistry } from '../scripts/check-registry.mjs';
import { REPOSITORY } from '../scripts/lib.mjs';
import { releaseZip, writeRegistryFixtures, commit } from './helpers/fixtures.mjs';

const generatedAt = '2025-02-01T00:00:00.000Z';

function registryVersion(overrides = {}) {
  return { version: '1.0.0', publishedAt: generatedAt, sourceCommit: commit, downloadUrl: `${REPOSITORY}/releases/download/test-skill-v1.0.0/test-skill-1.0.0.zip`, sha256: 'b'.repeat(64), size: 100, status: 'active', ...overrides };
}
function registryWith(version = registryVersion(), skill = {}) {
  return { schemaVersion: 1, generatedAt, repository: REPOSITORY, skills: [{ slug: 'test-skill', name: 'test-skill', description: 'A test skill.', latest: '1.0.0', status: 'active', license: 'MIT', versions: [version], ...skill }] };
}

test('registry builds multiple versions in descending order with deprecated/revoked status', async t => {
  const governance = { schemaVersion: 1, skills: { 'test-skill': { status: 'deprecated', statusReason: 'Superseded by a maintained alternative.', versions: { '1.0.0': 'deprecated', '2.0.0': 'revoked' } } } };
  const paths = await writeRegistryFixtures(t, [{ version: '1.0.0' }, { version: '2.0.0' }], governance);
  const registry = await buildRegistry({ ...paths, generatedAt });
  const skill = registry.skills[0];
  assert.deepEqual(skill.versions.map(v => [v.version, v.status]), [['2.0.0', 'revoked'], ['1.0.0', 'deprecated']]);
  assert.equal(skill.latest, '1.0.0');
  assert.equal(skill.status, 'deprecated');
  await checkRegistry(registry);
});

test('fully revoked skill has history but no latest recommendation', () => {
  const state = applyStatus('test-skill', [{ version: '1.0.0', status: 'active' }], { skills: { 'test-skill': { status: 'revoked', statusReason: 'Security incident under investigation.', versions: { '1.0.0': 'revoked' } } } });
  assert.equal(state.status, 'revoked');
  assert.equal(Object.hasOwn(state, 'latest'), false);
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
  const okFetch = async () => ({ ok: true, status: 200, headers: { get: key => key === 'content-length' ? '100' : null }, arrayBuffer: async () => Buffer.alloc(100) });
  const registry = registryWith(registryVersion({ sha256: 'cd00e292c5970d3c5e2f0ffa5171e555bc46bfc4faddfb4a418b6840b86e79a3' }));
  assert.equal(await checkRegistry(registry, { online: true, fetchImpl: okFetch }), true);
  const mismatch = async () => ({ ok: true, status: 200, headers: { get: () => '99' }, arrayBuffer: async () => Buffer.alloc(100) });
  await assert.rejects(checkRegistry(registry, { online: true, fetchImpl: mismatch }), /size mismatch/);
});
