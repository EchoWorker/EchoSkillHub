import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { auditThirdPartySkill } from '../scripts/audit-third-party-skill.mjs';
import { packageSkill } from '../scripts/package-skill.mjs';
import { validateSkill } from '../scripts/validate.mjs';
import { root, tempDir } from './helpers/fixtures.mjs';

const upstreamCommit = '0a64e398ec6bb34a494f0c347e8ccae53a862f8e';
const skill = slug => path.join(root, 'skills', slug);
const hash = value => createHash('sha256').update(value).digest('hex');

async function copiedSkill(t, slug) {
  const dir = path.join(await tempDir(t), slug);
  await cp(skill(slug), dir, { recursive: true });
  return dir;
}

async function probeSkill(t) {
  const dir = path.join(await tempDir(t), 'probe-skill');
  const probe = "from pathlib import Path\nPath('AUDIT_EXECUTED').write_text('unexpected')\n";
  const license = 'Apache-2.0\n';
  const skillMarkdown = '---\nname: probe-skill\ndescription: Probe.\n---\n# Probe\n';
  await mkdir(path.join(dir, 'scripts'), { recursive: true });
  await Promise.all([
    writeFile(path.join(dir, 'LICENSE.txt'), license),
    writeFile(path.join(dir, 'SKILL.md'), skillMarkdown),
    writeFile(path.join(dir, 'NOTICE'), 'Probe notice.\n'),
    writeFile(path.join(dir, 'scripts', 'probe.py'), probe)
  ]);
  const files = [
    ['LICENSE.txt', license], ['SKILL.md', skillMarkdown], ['scripts/probe.py', probe]
  ].map(([file, contents]) => ({
    path: file,
    sha256: hash(contents),
    size: Buffer.byteLength(contents),
    upstreamBlobSha: 'a'.repeat(40),
    upstreamSha256: hash(contents),
    ...(file === 'SKILL.md' ? { bodySha256: hash('# Probe\n') } : {})
  }));
  const source = { repository: 'https://example.invalid/upstream', commit: 'b'.repeat(40), path: 'skills/probe-skill', tree: 'c'.repeat(40), license: 'Apache-2.0', retrievedAt: '2026-08-20' };
  const notice = 'Probe notice.\n';
  await writeFile(path.join(dir, 'NOTICE'), notice);
  await writeFile(path.join(dir, 'PROVENANCE.json'), JSON.stringify({
    schemaVersion: 1,
    source,
    adaptation: { kind: 'frontmatter-metadata-only', details: 'Probe fixture.' },
    noticeSha256: hash(notice),
    files
  }));
  return dir;
}

test('imported third-party skills validate and expose canonical metadata provenance', async () => {
  const expected = {
    'frontend-design': { category: 'design', tags: 'frontend,ui,visual-design' },
    'skill-creator': { category: 'developer-tools', tags: 'benchmarking,evaluation,skill-authoring' }
  };
  for (const [slug, metadata] of Object.entries(expected)) {
    const valid = await validateSkill(skill(slug));
    assert.equal(valid.frontmatter.metadata.category, metadata.category);
    assert.equal(valid.frontmatter.metadata.tags, metadata.tags);
    assert.equal(valid.frontmatter.metadata['upstream-commit'], upstreamCommit);
    assert.equal(valid.frontmatter.metadata['upstream-path'], `skills/${slug}`);
    assert.equal(valid.frontmatter.metadata['upstream-repository'], 'https://github.com/anthropics/skills');
  }
});

test('third-party audits are deterministic and enumerate the imported resources', async () => {
  for (const slug of ['frontend-design', 'skill-creator']) {
    const first = await auditThirdPartySkill(skill(slug));
    const second = await auditThirdPartySkill(skill(slug));
    assert.deepEqual(second, first);
    assert.equal(first.source.commit, upstreamCommit);
    assert(first.files.some(file => file.path === 'LICENSE.txt'));
    assert(first.files.some(file => file.path === 'SKILL.md'));
  }
  const creator = await auditThirdPartySkill(skill('skill-creator'));
  assert(creator.files.some(file => file.path === 'agents/analyzer.md'));
  assert(creator.files.some(file => file.path === 'scripts/run_eval.py'));
  assert(creator.files.some(file => file.path === 'eval-viewer/viewer.html'));
});

test('audit provenance is strict about schema and file hashes', async t => {
  const malformed = await copiedSkill(t, 'frontend-design');
  const provenancePath = path.join(malformed, 'PROVENANCE.json');
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  provenance.source.commit = 'not-a-commit';
  await writeFile(provenancePath, JSON.stringify(provenance));
  await assert.rejects(auditThirdPartySkill(malformed), /invalid provenance|invalid source provenance/);

  const adapted = await copiedSkill(t, 'frontend-design');
  const adaptedPath = path.join(adapted, 'PROVENANCE.json');
  const adaptedProvenance = JSON.parse(await readFile(adaptedPath, 'utf8'));
  adaptedProvenance.adaptation.kind = 'content-change';
  await writeFile(adaptedPath, JSON.stringify(adaptedProvenance));
  await assert.rejects(auditThirdPartySkill(adapted), /invalid adaptation provenance/);

  const changed = await copiedSkill(t, 'frontend-design');
  await writeFile(path.join(changed, 'LICENSE'), 'tampered\n');
  await assert.rejects(auditThirdPartySkill(changed), /hash mismatch or undeclared file: LICENSE/);
});

test('audit is read-only and never executes imported code', async t => {
  const dir = await probeSkill(t);
  await assert.rejects(auditThirdPartySkill(dir), /source missing from trusted catalog/);
  await assert.rejects(access(path.join(dir, 'AUDIT_EXECUTED')));
});

test('third-party packages contain licensing, notice, provenance, and resources deterministically', async () => {
  for (const slug of ['frontend-design', 'skill-creator']) {
    const first = await packageSkill({ skillDir: skill(slug), version: '1.0.0', write: false });
    const second = await packageSkill({ skillDir: skill(slug), version: '1.0.0', write: false });
    assert.equal(first.sha256, second.sha256);
    assert.equal(Buffer.compare(first.bytes, second.bytes), 0);
    const zip = await JSZip.loadAsync(first.bytes);
    const names = Object.keys(zip.files);
    for (const required of ['LICENSE.txt', 'NOTICE', 'PROVENANCE.json', 'SKILL.md', 'manifest.json']) assert(names.includes(required), `${slug} package missing ${required}`);
    assert.equal(first.manifest.category, slug === 'frontend-design' ? 'design' : 'developer-tools');
  }
  const zip = await JSZip.loadAsync((await packageSkill({ skillDir: skill('skill-creator'), version: '1.0.0', write: false })).bytes);
  for (const resource of ['agents/analyzer.md', 'assets/eval_review.html', 'eval-viewer/generate_review.py', 'references/schemas.md', 'scripts/run_eval.py']) assert(Object.hasOwn(zip.files, resource), `skill-creator package missing ${resource}`);
});
