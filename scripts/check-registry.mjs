import { readFile } from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';
import { schemaValidator, assertValid, parseArgs, isMain } from './lib.mjs';

export async function checkRegistry(registry, { online = false, fetchImpl = globalThis.fetch } = {}) {
  if (typeof registry === 'string') registry = JSON.parse(await readFile(registry, 'utf8'));
  const validate = await schemaValidator(path.resolve('schemas/registry-v1.schema.json')); assertValid(validate, registry, 'registry');
  const slugs = new Set();
  for (const skill of registry.skills) {
    if (slugs.has(skill.slug) || skill.name !== skill.slug) throw new Error(`duplicate or inconsistent slug: ${skill.slug}`); slugs.add(skill.slug);
    const versions = new Set();
    for (const v of skill.versions) {
      if (versions.has(v.version) || !semver.valid(v.version)) throw new Error(`${skill.slug}: duplicate/invalid version ${v.version}`); versions.add(v.version);
      const expected = `${registry.repository}/releases/download/${skill.slug}-v${v.version}/${skill.slug}-${v.version}.zip`;
      if (v.downloadUrl !== expected) throw new Error(`${skill.slug}@${v.version}: non-canonical URL`);
      if (online) {
        const response = await fetchImpl(v.downloadUrl, { method: 'GET', redirect: 'follow' });
        if (!response.ok) throw new Error(`${v.downloadUrl}: HTTP ${response.status}`);
        const length = response.headers.get('content-length');
        if (length && Number(length) !== v.size) throw new Error(`${v.downloadUrl}: size mismatch`);
        const { createHash } = await import('node:crypto');
        const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
        if (digest !== v.sha256) throw new Error(`${v.downloadUrl}: digest mismatch`);
      }
    }
    if (skill.latest === undefined) {
      if (skill.status !== 'revoked' || skill.versions.some(v => v.status !== 'revoked')) throw new Error(`${skill.slug}: only a fully revoked skill may omit latest`);
    } else {
      const latest = skill.versions.find(v => v.version === skill.latest);
      if (!latest || latest.status === 'revoked') throw new Error(`${skill.slug}: invalid latest`);
    }
  }
  return true;
}
if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2)); checkRegistry(args.file ?? args._[0] ?? 'registry/v1/registry.json', { online: Boolean(args.online) }).then(() => console.log('registry valid')).catch(e => { console.error(e.message); process.exitCode = 1; });
}
