import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import semver from 'semver';
import { createHash } from 'node:crypto';
import { GitHubApi } from './github.mjs';
import {
  schemaValidator, assertValid, REPOSITORY, stableJson, parseArgs, isMain,
  loadCategoryTaxonomy, asciiCompare
} from './lib.mjs';

const taxonomyCategories = taxonomy => Array.isArray(taxonomy) ? taxonomy : taxonomy.categories;
const isActiveCategory = category => category.deprecated !== true;

export function applyStatus(slug, versions, governance = {}) {
  const rule = governance.skills?.[slug] ?? {};
  const mapped = versions.map(v => ({ ...v, status: rule.versions?.[v.version] ?? v.status ?? 'active' }));
  for (const v of mapped) if (!['active', 'deprecated', 'revoked'].includes(v.status)) throw new Error(`invalid status for ${slug}@${v.version}`);
  const candidates = mapped.filter(v => v.status !== 'revoked').sort((a, b) => semver.rcompare(a.version, b.version));
  const skillStatus = rule.status ?? (candidates[0]?.status === 'deprecated' ? 'deprecated' : 'active');
  if (['deprecated', 'revoked'].includes(rule.status) && !rule.statusReason) throw new Error(`${slug}: ${rule.status} status requires statusReason`);
  if (!candidates.length && skillStatus !== 'revoked') throw new Error(`${slug} has no non-revoked version; skill must be revoked`);
  if (skillStatus === 'revoked' && !candidates.length) return { versions: mapped.sort((a, b) => semver.rcompare(a.version, b.version)), status: 'revoked' };
  const latest = rule.latest ?? candidates[0]?.version;
  const selected = mapped.find(v => v.version === latest);
  if (!selected || selected.status === 'revoked') throw new Error(`latest for ${slug} must reference a non-revoked version`);
  return { versions: mapped.sort((a, b) => semver.rcompare(a.version, b.version)), latest, status: skillStatus };
}

async function releaseRecordsOnline(api) {
  const releases = await api.listReleases(); const records = [];
  for (const release of releases.filter(r => !r.draft)) {
    const m = /^([a-z0-9][a-z0-9-]{0,63})-v(.+)$/.exec(release.tag_name); if (!m || !semver.valid(m[2])) continue;
    const filename = `${m[1]}-${m[2]}.zip`; const asset = release.assets.find(a => a.name === filename); if (!asset) throw new Error(`${release.tag_name} missing ${filename}`);
    const bytes = await api.downloadAsset(asset); records.push({ release, asset, bytes, slug: m[1], version: m[2] });
  }
  return records;
}

async function releaseRecordsFixtures(file) {
  const root = JSON.parse(await readFile(file, 'utf8')); const base = path.dirname(path.resolve(file));
  return Promise.all((Array.isArray(root) ? root : root.releases).map(async r => {
    const slug = r.slug ?? /^(.+)-v/.exec(r.tag_name)?.[1]; const version = r.version ?? /-v(.+)$/.exec(r.tag_name)?.[1];
    const bytes = r.bytesBase64 ? Buffer.from(r.bytesBase64, 'base64') : await readFile(path.resolve(base, r.assetPath));
    const filename = `${slug}-${version}.zip`;
    return { slug, version, bytes, release: { tag_name: r.tag_name ?? `${slug}-v${version}`, published_at: r.publishedAt, target_commitish: r.sourceCommit }, asset: { name: filename, size: r.size ?? bytes.length, browser_download_url: r.downloadUrl ?? `${REPOSITORY}/releases/download/${slug}-v${version}/${filename}` } };
  }));
}

export function buildCategories(registry, taxonomy) {
  const counts = new Map();
  for (const skill of registry.skills) if (skill.status === 'active') counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
  return {
    schemaVersion: 1,
    generatedAt: registry.generatedAt,
    categories: taxonomyCategories(taxonomy).filter(isActiveCategory).sort((a, b) => a.order - b.order).map(({ slug, name, nameZhCN, description, order }) => ({ slug, name, nameZhCN, description, order, skillCount: counts.get(slug) ?? 0 }))
  };
}

export function buildTags(registry) {
  const counts = new Map();
  for (const skill of registry.skills) if (skill.status === 'active') for (const tag of skill.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return {
    schemaVersion: 1,
    generatedAt: registry.generatedAt,
    tags: [...counts].map(([slug, skillCount]) => ({ slug, skillCount })).sort((a, b) => b.skillCount - a.skillCount || asciiCompare(a.slug, b.slug))
  };
}

export async function buildRegistry({ api = new GitHubApi(), fixtures, governancePath = 'governance/status.json', generatedAt = new Date().toISOString(), repository = REPOSITORY, taxonomyPath = 'taxonomy/categories.json' } = {}) {
  const governance = JSON.parse(await readFile(governancePath, 'utf8'));
  const taxonomy = await loadCategoryTaxonomy(taxonomyPath);
  const categoriesBySlug = new Map(taxonomyCategories(taxonomy).map(category => [category.slug, category]));
  const governanceValidate = await schemaValidator(path.resolve('schemas/governance-status.schema.json')); assertValid(governanceValidate, governance, 'governance');
  const manifestValidate = await schemaValidator(path.resolve('schemas/skill-manifest.schema.json'));
  const records = fixtures ? await releaseRecordsFixtures(fixtures) : await releaseRecordsOnline(api);
  const grouped = new Map();
  for (const record of records) {
    if (record.asset.size !== record.bytes.length) throw new Error(`${record.release.tag_name}: asset size mismatch`);
    const zip = await JSZip.loadAsync(record.bytes); const manifestEntry = zip.file('manifest.json'); if (!manifestEntry) throw new Error(`${record.release.tag_name}: manifest missing`);
    const manifest = JSON.parse(await manifestEntry.async('string'));
    assertValid(manifestValidate, manifest, `${record.release.tag_name} manifest`);
    if (!categoriesBySlug.has(manifest.category)) throw new Error(`${record.release.tag_name}: unknown historical category ${manifest.category}`);
    if (manifest.metadata.category !== manifest.category || manifest.metadata.tags !== manifest.tags.join(',')) throw new Error(`${record.release.tag_name}: typed category/tags do not match raw metadata`);
    if (manifest.slug !== record.slug || manifest.version !== record.version || record.asset.name !== `${record.slug}-${record.version}.zip`) throw new Error(`${record.release.tag_name}: release/manifest mismatch`);
    const expectedUrl = `${repository}/releases/download/${record.slug}-v${record.version}/${record.asset.name}`;
    if (record.asset.browser_download_url !== expectedUrl) throw new Error(`${record.release.tag_name}: non-canonical asset URL`);
    const sourceCommit = record.release.target_commitish; if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error(`${record.release.tag_name}: source commit must be a full SHA`);
    const version = { version: record.version, publishedAt: record.release.published_at, sourceCommit, downloadUrl: expectedUrl, sha256: createHash('sha256').update(record.bytes).digest('hex'), size: record.bytes.length, status: 'active' };
    const existing = grouped.get(record.slug);
    if (existing) {
      for (const key of ['slug', 'name']) if (existing.manifests[0][key] !== manifest[key]) throw new Error(`${record.slug}: immutable manifest metadata ${key} changed across versions`);
      existing.versions.push(version); existing.manifests.push(manifest);
    } else grouped.set(record.slug, { manifests: [manifest], versions: [version] });
  }
  for (const [slug, rule] of Object.entries(governance.skills ?? {})) {
    const group = grouped.get(slug);
    if (!group) throw new Error(`${slug}: orphan governance override has no published release`);
    const published = new Set(group.versions.map(v => v.version));
    for (const version of Object.keys(rule.versions ?? {})) if (!published.has(version)) throw new Error(`${slug}@${version}: orphan governance override has no published release`);
  }
  const skills = [...grouped.entries()].sort(([a], [b]) => asciiCompare(a, b)).map(([slug, group]) => {
    if (new Set(group.versions.map(v => v.version)).size !== group.versions.length) throw new Error(`${slug}: duplicate version`);
    const state = applyStatus(slug, group.versions, governance);
    const selectedVersion = state.latest ?? group.versions.slice().sort((a, b) => semver.rcompare(a.version, b.version))[0].version;
    const manifestIndex = group.versions.findIndex(v => v.version === selectedVersion);
    const m = group.manifests[manifestIndex];
    if (state.latest && categoriesBySlug.get(m.category)?.deprecated === true) throw new Error(`${slug}@${state.latest}: selected category ${m.category} is deprecated`);
    const selected = state.versions.find(v => v.version === state.latest);
    return { slug, name: m.name, description: m.description, category: m.category, tags: m.tags, ...(state.latest ? { latest: state.latest, downloadUrl: selected.downloadUrl } : {}), status: state.status, ...(governance.skills?.[slug]?.statusReason ? { statusReason: governance.skills[slug].statusReason } : {}), ...(m.platforms ? { platforms: m.platforms } : {}), ...(m.license ? { license: m.license } : {}), ...(m.compatibility ? { compatibility: m.compatibility } : {}), ...(m.metadata ? { metadata: m.metadata } : {}), ...(m.allowedTools ? { allowedTools: m.allowedTools } : {}), versions: state.versions };
  });
  const registry = { schemaVersion: 1, generatedAt, repository, skills };
  const validate = await schemaValidator(path.resolve('schemas/registry-v1.schema.json')); assertValid(validate, registry, 'registry');
  return registry;
}

export async function buildRegistryArtifacts(options = {}) {
  const registry = await buildRegistry(options);
  const taxonomy = await loadCategoryTaxonomy(options.taxonomyPath ?? 'taxonomy/categories.json');
  const categories = buildCategories(registry, taxonomy);
  const tags = buildTags(registry);
  for (const [name, artifact] of Object.entries({ categories, tags })) {
    const validate = await schemaValidator(path.resolve(`schemas/${name}-v1.schema.json`)); assertValid(validate, artifact, name);
  }
  return { registry, categories, tags };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2)); const outputDir = args['output-dir'] ?? 'registry/v1';
  buildRegistryArtifacts({ fixtures: args.fixtures ?? args['offline-fixtures'], governancePath: args.status ?? args.governance ?? 'governance/status.json', taxonomyPath: args.taxonomy ?? 'taxonomy/categories.json', generatedAt: args['generated-at'] ?? new Date().toISOString() }).then(async artifacts => {
    await mkdir(outputDir, { recursive: true });
    await Promise.all(Object.entries(artifacts).map(([name, value]) => writeFile(path.join(outputDir, `${name}.json`), stableJson(value))));
    console.log(`built ${outputDir}`);
  }).catch(e => { console.error(e.message); process.exitCode = 1; });
}
