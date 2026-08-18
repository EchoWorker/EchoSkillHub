import test from 'node:test';
import assert from 'node:assert/strict';
import { generateManifest } from '../scripts/generate-manifest.mjs';
import { parseSkillMarkdown } from '../scripts/lib.mjs';
import { fixture, makeSkill } from './helpers/fixtures.mjs';

const forbidden = ['runtime', 'capabilities', 'permissions', 'dependencies'];

test('manifest preserves all Agent Skills spec fields', async () => {
  const manifest = await generateManifest({ skillDir: fixture('cross-platform'), version: '1.2.3' });
  assert.deepEqual(manifest.platforms, ['windows', 'macos', 'linux']);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.compatibility, 'Requires Node.js 22 or later.');
  assert.deepEqual(manifest.metadata, { author: 'EchoWorker', version: '1.0', 'echoskillhub-platforms': 'windows,macos,linux' });
  assert.equal(manifest.allowedTools, 'Read Grep');
  for (const key of forbidden) assert.equal(Object.hasOwn(manifest, key), false);
});

test('minimal spec skill omits every optional field', async () => {
  const manifest = await generateManifest({ skillDir: fixture('unspecified-platforms'), version: '1.0.0' });
  for (const key of ['platforms', 'license', 'compatibility', 'metadata', 'allowedTools']) assert.equal(Object.hasOwn(manifest, key), false);
});

test('frontmatter accepts only Agent Skills spec fields for portable uploads', async t => {
  const parsed = parseSkillMarkdown(`---\nname: portable-skill\ndescription: Does work. Use when work is requested.\nlicense: MIT\ncompatibility: Requires git.\nmetadata:\n  author: test\nallowed-tools: Read Grep\n---\n`);
  assert.deepEqual(Object.keys(parsed.frontmatter), ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  const dir = await makeSkill(t, { frontmatter: { 'argument-hint': '[file]' } });
  await assert.rejects(generateManifest({ skillDir: dir, version: '1.0.0' }), /unexpected frontmatter|unknown frontmatter/i);
});

test('portable optional strings and allowed-tools constraints are enforced', () => {
  assert.doesNotThrow(() => parseSkillMarkdown(`---\nname: portable-skill\ndescription: Does work when requested.\ncompatibility: Requires <custom-runtime> 1.0.\nmetadata:\n  template: <value>\nallowed-tools: Read Grep\n---\n`));
  const padded = parseSkillMarkdown(`---\nname: portable-skill\ndescription: Does work when requested.\ncompatibility: " arbitrary compatibility "\nmetadata:\n  template: <value>\n---\n`);
  assert.equal(padded.frontmatter.compatibility, ' arbitrary compatibility ');
  for (const value of ['Read,Grep', 'Read\tGrep', 'Read  Grep']) {
    assert.throws(() => parseSkillMarkdown(`---\nname: portable-skill\ndescription: Does work when requested.\nallowed-tools: "${value}"\n---\n`), /space-separated/);
  }
});

test('strict SemVer and directory/frontmatter identity are enforced', async t => {
  await assert.rejects(generateManifest({ skillDir: fixture('unspecified-platforms'), version: 'v1.0.0' }), /SemVer|schema validation/);
  const dir = await makeSkill(t, { slug: 'directory-name', frontmatter: { name: 'other-name' } });
  await assert.rejects(generateManifest({ skillDir: dir, version: '1.0.0' }), /does not match/);
});

test('Agent Skills name and description constraints are enforced', async t => {
  const consecutive = await makeSkill(t, { slug: 'bad--name', frontmatter: { name: 'bad--name' } });
  await assert.rejects(generateManifest({ skillDir: consecutive, version: '1.0.0' }), /invalid (?:skill directory )?name/);
  const reserved = await makeSkill(t, { slug: 'claude-helper', frontmatter: { name: 'claude-helper' } });
  await assert.rejects(generateManifest({ skillDir: reserved, version: '1.0.0' }), /reserved word/);
  const xml = await makeSkill(t, { frontmatter: { description: 'Does <tag>work</tag>.' } });
  await assert.rejects(generateManifest({ skillDir: xml, version: '1.0.0' }), /XML tags/);
});

test('invalid Hub platform metadata is rejected', async t => {
  const dir = await makeSkill(t, { frontmatter: { metadata: { 'echoskillhub-platforms': 'linux,android' } } });
  await assert.rejects(generateManifest({ skillDir: dir, version: '1.0.0' }), /echoskillhub-platforms/);
});

test('generated minimal Manifest has schema-approved field set', async () => {
  const manifest = await generateManifest({ skillDir: fixture('unspecified-platforms'), version: '1.0.0' });
  assert.deepEqual(Object.keys(manifest), ['schemaVersion', 'slug', 'name', 'version', 'description', 'homepage']);
});
