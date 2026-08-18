import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import JSZip from 'jszip';
import { REPOSITORY } from '../../scripts/lib.mjs';

export const root = path.resolve(import.meta.dirname, '../..');
export const fixture = name => path.join(root, 'test/fixtures/skills', name);
export const commit = 'a'.repeat(40);

export async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'echoskillhub-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export async function makeSkill(t, { slug = 'test-skill', frontmatter = {}, body = '# Test\n', license = true, files = {} } = {}) {
  const parent = await tempDir(t);
  const dir = path.join(parent, slug);
  await mkdir(dir, { recursive: true });
  const data = { name: slug, description: 'A test skill.', ...frontmatter };
  await writeFile(path.join(dir, 'SKILL.md'), `---\n${YAML.stringify(data).trimEnd()}\n---\n\n${body}`);
  if (license) await writeFile(path.join(dir, 'LICENSE'), 'MIT License\n');
  for (const [name, value] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), value);
  }
  return dir;
}

export async function releaseZip({ slug = 'test-skill', version = '1.0.0', manifest = {}, extra = {} } = {}) {
  const zip = new JSZip();
  const value = { schemaVersion: 1, slug, name: slug, version, description: 'A test skill.', license: 'MIT', homepage: `${REPOSITORY}/tree/main/skills/${slug}`, ...manifest };
  zip.file('manifest.json', `${JSON.stringify(value)}\n`);
  for (const [name, contents] of Object.entries(extra)) zip.file(name, contents);
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function writeRegistryFixtures(t, releases, governance = { schemaVersion: 1, skills: {} }) {
  const dir = await tempDir(t);
  const fixtureReleases = [];
  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const bytes = release.bytes ?? await releaseZip(release);
    const assetPath = `asset-${i}.zip`;
    await writeFile(path.join(dir, assetPath), bytes);
    fixtureReleases.push({ slug: release.slug ?? 'test-skill', version: release.version ?? '1.0.0', assetPath, publishedAt: release.publishedAt ?? '2025-01-01T00:00:00.000Z', sourceCommit: release.sourceCommit ?? commit, ...(release.fixture ?? {}) });
  }
  await writeFile(path.join(dir, 'releases.json'), JSON.stringify({ releases: fixtureReleases }));
  await writeFile(path.join(dir, 'status.json'), JSON.stringify(governance));
  return { fixtures: path.join(dir, 'releases.json'), governancePath: path.join(dir, 'status.json') };
}

export async function trySymlink(target, link) {
  try { await symlink(target, link, 'file'); return true; } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return false;
    throw error;
  }
}
