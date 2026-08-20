import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, isMain, stableJson } from './lib.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const SHA1_RE = /^[a-f0-9]{40}$/;
const SUSPICIOUS = [
  ['remote download', /\b(?:curl|wget|Invoke-WebRequest)\b|https?:\/\//i],
  ['package installation', /\b(?:npm|pnpm|pip|uv|brew|apt(?:-get)?)\s+(?:install|add)\b/i],
  ['credential access', /\b(?:API[_ -]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\b/i],
  ['environment access', /\b(?:os\.environ|process\.env|\$env:|Get-ChildItem\s+Env:)\b/i]
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function skillBody(bytes) {
  const text = bytes.toString('utf8');
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('SKILL.md has no frontmatter');
  return Buffer.from(text.slice(match[0].length));
}
async function files(root, dir = root) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name); const relative = path.relative(root, absolute).split(path.sep).join('/'); const stat = await lstat(absolute);
    if (stat.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) throw new Error(`unsupported link or file type: ${relative}`);
    if (entry.isDirectory()) result.push(...await files(root, absolute)); else result.push({ absolute, relative, stat });
  }
  return result.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}
function validSource(source) {
  return Object.keys(source).sort().join(',') === 'commit,license,path,repository,retrievedAt,tree'
    && typeof source.repository === 'string' && source.repository.startsWith('https://')
    && SHA1_RE.test(source.commit) && SHA1_RE.test(source.tree) && source.license === 'Apache-2.0'
    && /^skills\/[a-z0-9-]+$/.test(source.path) && /^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt);
}
function validFile(item) {
  const keys = item.path === 'SKILL.md' ? 'bodySha256,path,sha256,size,upstreamBlobSha,upstreamSha256' : 'path,sha256,size,upstreamBlobSha,upstreamSha256';
  return item && Object.keys(item).sort().join(',') === keys && typeof item.path === 'string'
    && SHA256_RE.test(item.sha256) && SHA256_RE.test(item.upstreamSha256) && SHA1_RE.test(item.upstreamBlobSha)
    && Number.isInteger(item.size) && item.size >= 0 && (item.path !== 'SKILL.md' || SHA256_RE.test(item.bodySha256));
}
export async function auditThirdPartySkill(skillDir) {
  const root = path.resolve(skillDir); const provenancePath = path.join(root, 'PROVENANCE.json'); const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
  const catalog = JSON.parse(await readFile(path.resolve('third-party-sources.json'), 'utf8'));
  if (!catalog || catalog.schemaVersion !== 1 || !catalog.sources || typeof catalog.sources !== 'object') throw new Error('third-party-sources.json: invalid trusted source catalog');
  const expectedSource = catalog.sources[path.basename(provenance.source.path)];
  if (!provenance || provenance.schemaVersion !== 1 || Object.keys(provenance).length !== 5 || !validSource(provenance.source) || !Array.isArray(provenance.files) || typeof provenance.noticeSha256 !== 'string' || !SHA256_RE.test(provenance.noticeSha256)) throw new Error(`${provenancePath}: invalid provenance`);
  if (!expectedSource || Object.keys(expectedSource).sort().join(',') !== 'commit,path,repository,skillBodySha256,tree' || !SHA256_RE.test(expectedSource.skillBodySha256)) throw new Error(`${provenancePath}: source missing from trusted catalog`);
  if (expectedSource.repository !== provenance.source.repository || expectedSource.commit !== provenance.source.commit || expectedSource.path !== provenance.source.path || expectedSource.tree !== provenance.source.tree) throw new Error(`${provenancePath}: source differs from trusted catalog`);
  if (!provenance.adaptation || Object.keys(provenance.adaptation).sort().join(',') !== 'details,kind' || provenance.adaptation.kind !== 'frontmatter-metadata-only' || typeof provenance.adaptation.details !== 'string') throw new Error(`${provenancePath}: invalid adaptation provenance`);
  if (provenance.files.some(item => !validFile(item))) throw new Error(`${provenancePath}: invalid file provenance`);
  const all = await files(root); const declared = new Map(provenance.files.map(item => [item.path, item]));
  const notice = all.find(file => file.relative === 'NOTICE');
  if (!all.some(file => file.relative === 'LICENSE.txt') || !notice || !all.some(file => file.relative === 'SKILL.md')) throw new Error(`${provenancePath}: third-party Skills require root LICENSE.txt, NOTICE, and SKILL.md`);
  if (digest(await readFile(notice.absolute)) !== provenance.noticeSha256) throw new Error(`${provenancePath}: NOTICE hash mismatch`);
  const actual = []; const findings = [];
  for (const file of all) {
    if (file.relative === 'PROVENANCE.json' || file.relative === 'NOTICE') continue;
    const bytes = await readFile(file.absolute); const hash = digest(bytes); const record = declared.get(file.relative);
    if (!record || record.sha256 !== hash || record.size !== bytes.length) throw new Error(`${provenancePath}: hash mismatch or undeclared file: ${file.relative}`);
    if (file.relative === 'SKILL.md') {
      if (digest(skillBody(bytes)) !== record.bodySha256) throw new Error(`${provenancePath}: SKILL.md body differs from pinned upstream`);
      if (digest(skillBody(bytes)) !== expectedSource.skillBodySha256) throw new Error(`${provenancePath}: SKILL.md body differs from trusted upstream catalog`);
    } else if (file.relative !== 'LICENSE.txt' && record.upstreamSha256 !== hash) throw new Error(`${provenancePath}: imported file differs from pinned upstream: ${file.relative}`);
    actual.push({ path: file.relative, sha256: hash, size: bytes.length });
    const text = bytes.toString('utf8'); for (const [kind, pattern] of SUSPICIOUS) if (pattern.test(text)) findings.push({ path: file.relative, kind });
  }
  if (declared.size !== actual.length || provenance.files.some(item => !actual.some(file => file.path === item.path))) throw new Error(`${provenancePath}: declared file set does not match skill tree`);
  return { schemaVersion: 1, skill: path.basename(root), source: provenance.source, files: actual, findings };
}
if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2)); auditThirdPartySkill(args.skill ?? args._[0]).then(value => console.log(stableJson(value))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
