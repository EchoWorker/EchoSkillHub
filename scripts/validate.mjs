import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readSkill, parseArgs, isMain } from './lib.mjs';

export const LIMITS = Object.freeze({ files: 1000, fileSize: 10 * 1024 * 1024, totalSize: 50 * 1024 * 1024 });
const DENIED = new Set(['manifest.json', '.ds_store', 'thumbs.db', 'desktop.ini', '.env', 'id_rsa', 'id_ed25519']);
const EXEC_EXT = new Set(['.exe', '.dll', '.com', '.msi', '.dylib', '.so', '.app', '.jar', '.class', '.wasm']);
const SCRIPT_EXT = new Set(['.ps1', '.psm1', '.bat', '.cmd', '.vbs', '.wsf']);
const NATIVE_MAGICS = [
  ['PE', Buffer.from([0x4d, 0x5a])],
  ['ELF', Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
  ['Mach-O', Buffer.from([0xfe, 0xed, 0xfa, 0xce])],
  ['Mach-O', Buffer.from([0xce, 0xfa, 0xed, 0xfe])],
  ['Mach-O', Buffer.from([0xfe, 0xed, 0xfa, 0xcf])],
  ['Mach-O', Buffer.from([0xcf, 0xfa, 0xed, 0xfe])],
  ['Mach-O universal', Buffer.from([0xca, 0xfe, 0xba, 0xbe])],
  ['Mach-O universal 64-bit', Buffer.from([0xca, 0xfe, 0xba, 0xbf])],
  ['Mach-O universal', Buffer.from([0xbe, 0xba, 0xfe, 0xca])],
  ['Mach-O universal 64-bit', Buffer.from([0xbf, 0xba, 0xfe, 0xca])],
  ['WebAssembly', Buffer.from([0x00, 0x61, 0x73, 0x6d])]
];
const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[opusr]_[A-Za-z0-9_]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['generic secret', /(?:api[\s_-]*key|access[\s_-]*token|clie(?:nt)[\s_-]*secret)\s*[:=]\s*["']?[A-Za-z0-9_\-\/.+=]{20,}/i]
];

function hasLeadingMagic(bytes, magic) {
  const maxOffset = Math.min(16, bytes.length - magic.length);
  for (let offset = 0; offset <= maxOffset; offset++) {
    if (bytes.subarray(offset, offset + magic.length).equals(magic)) return true;
  }
  return false;
}

function portablePart(part) {
  return part && part !== '.' && part !== '..' && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part);
}

export function assertNoCaseCollisions(relativePaths) {
  const folded = new Set();
  for (const relative of relativePaths) {
    const key = relative.toLowerCase();
    if (folded.has(key)) throw new Error(`case-insensitive path collision: ${relative}`);
    folded.add(key);
  }
}

export async function collectSkillFiles(skillDir, limits = LIMITS) {
  const root = path.resolve(skillDir); const files = []; const relativePaths = []; let totalSize = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name); const stat = await lstat(absolute);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error(`links are forbidden: ${absolute}`);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (path.isAbsolute(relative) || relative.startsWith('../') || relative.split('/').some(p => !portablePart(p))) throw new Error(`non-portable or escaping path: ${relative}`);
      relativePaths.push(relative);
      if (entry.isDirectory()) { if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.cache')) throw new Error(`forbidden directory: ${relative}`); await walk(absolute); }
      else if (!entry.isFile()) throw new Error(`unsupported file type: ${relative}`);
      else {
        if (DENIED.has(entry.name.toLowerCase()) || /(?:~|\.tmp|\.swp|\.bak)$/.test(entry.name.toLowerCase())) throw new Error(`forbidden generated/temporary file: ${relative}`);
        if (EXEC_EXT.has(path.extname(entry.name).toLowerCase())) throw new Error(`native/executable file forbidden: ${relative}`);
        if (SCRIPT_EXT.has(path.extname(entry.name).toLowerCase()) && !isScriptDirectory(relative)) throw new Error(`executable script outside approved script directories: ${relative}`);
        if (stat.mode & 0o111) throw new Error(`executable permission forbidden: ${relative}`);
        if (stat.size > limits.fileSize) throw new Error(`file too large: ${relative}`);
        totalSize += stat.size; if (totalSize > limits.totalSize) throw new Error('skill unpacked size limit exceeded');
        files.push({ relative, absolute, size: stat.size }); if (files.length > limits.files) throw new Error('skill file count limit exceeded');
      }
    }
  }
  await walk(root);
  assertNoCaseCollisions(relativePaths);
  files.sort((a, b) => Buffer.from(a.relative).compare(Buffer.from(b.relative)));
  return files;
}

function isScriptDirectory(relative) { return relative.startsWith('scripts/') || relative === 'eval-viewer/generate_review.py'; }

export async function validateSkill(skillDir, options = {}) {
  const skill = await readSkill(skillDir); const files = await collectSkillFiles(skillDir, options.limits);
  const roots = files.filter(f => f.relative.toLowerCase() === 'skill.md');
  if (roots.length !== 1 || roots[0].relative !== 'SKILL.md') throw new Error('exactly one root SKILL.md is required');
  for (const file of files) {
    const bytes = await readFile(file.absolute);
    for (const [name, magic] of NATIVE_MAGICS) if (hasLeadingMagic(bytes, magic)) throw new Error(`${name} executable content forbidden: ${file.relative}`);
    const text = bytes.toString('utf8').replaceAll('\u0000', '').replace(/^\uFEFF/, '').trimStart();
    for (const [name, pattern] of SECRET_PATTERNS) if (pattern.test(text)) throw new Error(`possible ${name} in ${file.relative}`);
    if (text.startsWith('#!') && !isScriptDirectory(file.relative)) throw new Error(`executable script outside approved script directories: ${file.relative}`);
  }
  return { slug: skill.slug, frontmatter: skill.frontmatter, files, totalSize: files.reduce((n, f) => n + f.size, 0) };
}

export function validateVersionLabels(labels) {
  const found = labels.map(x => typeof x === 'string' ? x : x.name).filter(x => ['major', 'minor', 'patch'].includes(x));
  if (found.length !== 1) throw new Error('exactly one version label is required: major, minor, or patch');
  return found[0];
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const run = async () => {
    let dirs = args._.length ? args._ : args['skill-dir'] ? [args['skill-dir']] : [];
    if (args.all) {
      const entries = await readdir(path.resolve('skills'), { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
      dirs = entries.filter(entry => entry.isDirectory()).map(entry => path.join('skills', entry.name)).sort();
    }
    if (args.labels) validateVersionLabels(JSON.parse(args.labels));
    if (!dirs.length && !args.all) throw new Error('usage: validate.mjs <skill-dir> [...] or --all');
    const results = await Promise.all(dirs.map(validateSkill));
    console.log(`validated ${results.length} skill(s)`);
  };
  run().catch(e => { console.error(e.message); process.exitCode = 1; });
}
