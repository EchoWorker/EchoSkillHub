import path from 'node:path';
import semver from 'semver';
import { readSkill, schemaValidator, assertValid, REPOSITORY, PLATFORM_METADATA_KEY, parseArgs, stableJson, isMain } from './lib.mjs';

export async function generateManifest({ skillDir, version, repository = REPOSITORY }) {
  if (!semver.valid(version, { loose: false })) throw new Error(`invalid strict SemVer: ${version}`);
  const { slug, frontmatter } = await readSkill(skillDir);
  const declaredPlatforms = frontmatter.metadata?.[PLATFORM_METADATA_KEY]?.split(',').map(value => value.trim());
  const manifest = {
    schemaVersion: 1, slug, name: frontmatter.name, version,
    description: frontmatter.description,
    ...(declaredPlatforms ? { platforms: declaredPlatforms } : {}),
    ...(frontmatter.license ? { license: frontmatter.license } : {}),
    ...(frontmatter.compatibility ? { compatibility: frontmatter.compatibility } : {}),
    ...(frontmatter.metadata ? { metadata: frontmatter.metadata } : {}),
    ...(frontmatter['allowed-tools'] ? { allowedTools: frontmatter['allowed-tools'] } : {}),
    homepage: `${repository}/tree/main/skills/${slug}`
  };
  const validate = await schemaValidator(path.resolve('schemas/skill-manifest.schema.json'));
  assertValid(validate, manifest, 'manifest');
  return manifest;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  generateManifest({ skillDir: args.skill ?? args['skill-dir'] ?? args._[0], version: args.version ?? args._[1], repository: args.repository ?? REPOSITORY })
    .then(m => process.stdout.write(stableJson(m))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
