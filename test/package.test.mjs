import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { packageSkill, sha256 } from '../scripts/package-skill.mjs';
import { fixture } from './helpers/fixtures.mjs';

test('packaging is byte-for-byte deterministic', async () => {
  const a = await packageSkill({ skillDir: fixture('unspecified-platforms'), version: '1.2.3', write: false });
  const b = await packageSkill({ skillDir: fixture('unspecified-platforms'), version: '1.2.3', write: false });
  assert.equal(Buffer.compare(a.bytes, b.bytes), 0);
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.sha256, sha256(a.bytes));
});

test('ZIP entries are sorted, rooted, normalized, and include generated manifest', async () => {
  const result = await packageSkill({ skillDir: fixture('unspecified-platforms'), version: '1.2.3', write: false });
  const zip = await JSZip.loadAsync(result.bytes);
  const names = Object.keys(zip.files);
  assert.deepEqual(names, ['LICENSE', 'SKILL.md', 'manifest.json']);
  assert(names.every(name => !name.startsWith('/') && !name.startsWith('cross-platform/')));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.license, undefined);
  assert.equal(Object.hasOwn(manifest, 'platforms'), false);
  for (const entry of Object.values(zip.files)) {
    assert.equal(entry.date.toISOString(), '1980-01-01T00:00:00.000Z');
    assert.equal(entry.unixPermissions, 0o100644);
  }
});
