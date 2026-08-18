import { packageSkill } from './package-skill.mjs';
import { GitHubApi, publishImmutable } from './github.mjs';
import { parseArgs, isMain } from './lib.mjs';

export async function publishSkill({ skillDir, version, sourceCommit, api = new GitHubApi() }) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('sourceCommit must be a full lowercase commit SHA');
  const packaged = await packageSkill({ skillDir, version, write: false });
  const result = await publishImmutable({ api, slug: packaged.manifest.slug, version, sourceCommit, filename: packaged.filename, bytes: packaged.bytes, sha256: packaged.sha256 });
  const downloaded = await api.downloadAsset(result.asset);
  if (downloaded.length !== packaged.size || Buffer.compare(downloaded, packaged.bytes) !== 0) throw new Error('uploaded asset verification failed');
  return { ...result, sha256: packaged.sha256, size: packaged.size };
}
if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  publishSkill({ skillDir: args['skill-dir'] ?? args._[0], version: args.version ?? args._[1], sourceCommit: args.commit ?? args._[2] }).then(r => console.log(JSON.stringify({ tag: r.tag, asset: r.asset.browser_download_url, sha256: r.sha256, reused: r.reused }))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
