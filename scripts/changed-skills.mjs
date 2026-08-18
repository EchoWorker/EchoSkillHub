import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs, isMain } from './lib.mjs';
const exec = promisify(execFile);

export function changedSkillsFromPaths(paths) {
  return [...new Set(paths.map(p => p.replaceAll('\\', '/')).map(p => /^skills\/([^/]+)(?:\/|$)/.exec(p)?.[1]).filter(Boolean))].sort();
}
export async function getChangedSkills({ before, after = 'HEAD', cwd = process.cwd() }) {
  if (!before) throw new Error('before revision is required');
  const { stdout } = await exec('git', ['diff', '--name-only', '-z', before, after, '--', 'skills'], { cwd, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
  return changedSkillsFromPaths(stdout.toString('utf8').split('\0').filter(Boolean));
}
if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  getChangedSkills({ before: args.before ?? args._[0], after: args.after ?? args._[1] ?? 'HEAD' }).then(v => process.stdout.write(`${JSON.stringify(v)}\n`)).catch(e => { console.error(e.message); process.exitCode = 1; });
}
