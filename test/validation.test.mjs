import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSkill, collectSkillFiles, validateVersionLabels, assertNoCaseCollisions } from '../scripts/validate.mjs';
import { changedSkillsFromPaths } from '../scripts/changed-skills.mjs';
import { fixture, makeSkill, tempDir, trySymlink } from './helpers/fixtures.mjs';

test('valid unspecified-platform fixture passes validation', async () => {
  await validateSkill(fixture('unspecified-platforms'));
});

test('cross-platform fixture with forward-compatible runtime metadata passes validation', async () => {
  await validateSkill(fixture('cross-platform'));
});

test('directory mismatch and invalid Hub platform metadata are rejected', async t => {
  const mismatch = await makeSkill(t, { slug: 'folder', frontmatter: { name: 'different' } });
  await assert.rejects(validateSkill(mismatch), /does not match/);
  const bad = await makeSkill(t, { frontmatter: { metadata: { 'echoskillhub-platforms': 'android' } } });
  await assert.rejects(validateSkill(bad), /echoskillhub-platforms/);
});

test('committed manifest is rejected', async t => {
  const dir = await makeSkill(t, { files: { 'manifest.json': '{}' } });
  await assert.rejects(validateSkill(dir), /forbidden generated\/temporary file/);
});

test('secrets are rejected regardless of file size or NUL padding', async t => {
  const dir = await makeSkill(t, { files: { 'notes.txt': `${'a'.repeat(1024 * 1024)}\napi_key=${'x'.repeat(32)}` } });
  await assert.rejects(validateSkill(dir), /possible generic secret/);
  const nul = await makeSkill(t, { files: { 'notes.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`api_key=${'x'.repeat(32)}`)]) } });
  await assert.rejects(validateSkill(nul), /possible generic secret/);
});

test('native executable extension, magic, and misplaced scripts are rejected', async t => {
  const native = await makeSkill(t, { files: { 'payload.exe': 'not really executable' } });
  await assert.rejects(validateSkill(native), /native\/executable/);
  const renamed = await makeSkill(t, { files: { 'payload.dat': Buffer.from([0x4d, 0x5a, 0x00, 0x00]) } });
  await assert.rejects(validateSkill(renamed), /PE executable content/);
  const universal = await makeSkill(t, { files: { 'payload.bin': Buffer.from([0xca, 0xfe, 0xba, 0xbf]) } });
  await assert.rejects(validateSkill(universal), /Mach-O universal 64-bit/);
  const universalLittle = await makeSkill(t, { files: { 'payload.bin': Buffer.from([0xbf, 0xba, 0xfe, 0xca]) } });
  await assert.rejects(validateSkill(universalLittle), /Mach-O universal 64-bit/);
  const powershell = await makeSkill(t, { files: { 'run.ps1': 'Write-Output no' } });
  await assert.rejects(validateSkill(powershell), /executable script outside scripts/);
  const script = await makeSkill(t, { files: { 'run.sh': '#!/bin/sh\necho no\n' } });
  await assert.rejects(validateSkill(script), /executable script outside scripts/);
});

test('symbolic links are rejected when supported by host', async t => {
  const dir = await makeSkill(t);
  const linked = await trySymlink(path.join(dir, 'LICENSE'), path.join(dir, 'COPYING'));
  if (!linked) return t.skip('symlink creation unavailable');
  await assert.rejects(validateSkill(dir), /links are forbidden/);
});

test('case-insensitive path collisions are rejected', () => {
  assert.throws(() => assertNoCaseCollisions(['Readme.txt', 'README.txt']), /case-insensitive path collision/);
});

test('file count, individual file, and total size limits are enforced', async t => {
  const count = await makeSkill(t, { files: { 'a.txt': 'a', 'b.txt': 'b' } });
  await assert.rejects(collectSkillFiles(count, { files: 2, fileSize: 1000, totalSize: 10000 }), /file count/);
  const large = await makeSkill(t, { files: { 'large.txt': '12345' } });
  await assert.rejects(collectSkillFiles(large, { files: 100, fileSize: 4, totalSize: 10000 }), /file too large/);
  await assert.rejects(collectSkillFiles(large, { files: 100, fileSize: 10000, totalSize: 5 }), /unpacked size/);
});

test('deleted changed Skill is detected and cannot validate', async t => {
  assert.deepEqual(changedSkillsFromPaths(['skills/removed-skill/SKILL.md']), ['removed-skill']);
  const parent = await tempDir(t);
  await assert.rejects(validateSkill(path.join(parent, 'removed-skill')), /ENOENT/);
});

test('version labels require exactly one recognized bump', () => {
  assert.equal(validateVersionLabels(['documentation', 'minor']), 'minor');
  assert.throws(() => validateVersionLabels([]), /exactly one/);
  assert.throws(() => validateVersionLabels(['major', 'patch']), /exactly one/);
  assert.throws(() => validateVersionLabels([{ name: 'bug' }]), /exactly one/);
});
