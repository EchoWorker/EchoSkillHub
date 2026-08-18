import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { generateManifest } from './generate-manifest.mjs';
import { validateSkill } from './validate.mjs';
import { parseArgs, isMain } from './lib.mjs';

const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export async function packageSkill({ skillDir, version, outputDir = '.', repository, write = true }) {
  const validated = await validateSkill(skillDir);
  const manifest = await generateManifest({ skillDir, version, ...(repository ? { repository } : {}) });
  const zip = new JSZip();
  for (const file of validated.files) zip.file(file.relative, await readFile(file.absolute), { date: ZIP_DATE, unixPermissions: 0o100644, createFolders: false });
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, { date: ZIP_DATE, unixPermissions: 0o100644, createFolders: false });
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX', streamFiles: false });
  if (bytes.length > 50 * 1024 * 1024) throw new Error('ZIP size limit exceeded');
  const filename = `${manifest.slug}-${manifest.version}.zip`; const result = { manifest, filename, bytes, sha256: sha256(bytes), size: bytes.length };
  if (write) { await mkdir(outputDir, { recursive: true }); result.outputPath = path.resolve(outputDir, filename); await writeFile(result.outputPath, bytes); }
  return result;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  packageSkill({ skillDir: args.skill ?? args['skill-dir'] ?? args._[0], version: args.version ?? args._[1], outputDir: args.output ?? args._[2] ?? '.' })
    .then(r => console.log(JSON.stringify({ path: r.outputPath, sha256: r.sha256, size: r.size }))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
