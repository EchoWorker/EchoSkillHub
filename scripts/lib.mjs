import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const REPOSITORY = 'https://github.com/EchoWorker/EchoSkillHub';
export const SLUG_RE = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PLATFORMS = new Set(['windows', 'macos', 'linux']);
export const PLATFORM_METADATA_KEY = 'echoskillhub-platforms';

export function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export function parseSkillMarkdown(text, source = 'SKILL.md') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error(`${source}: required YAML frontmatter is missing or malformed`);
  let data;
  try { data = YAML.parse(match[1]); } catch (error) { throw new Error(`${source}: invalid YAML: ${error.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${source}: frontmatter must be an object`);
  const specFields = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
  const unknown = Object.keys(data).filter(key => !specFields.has(key));
  if (unknown.length) throw new Error(`${source}: unexpected frontmatter field(s): ${unknown.join(', ')}; Agent Skills allows name, description, license, compatibility, metadata, allowed-tools`);
  for (const key of ['name', 'description']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) throw new Error(`${source}: frontmatter ${key} is required`);
    if (data[key] !== data[key].trim()) throw new Error(`${source}: frontmatter ${key} must not have surrounding whitespace`);
  }
  if (data.name.length > 64 || !SLUG_RE.test(data.name)) throw new Error(`${source}: invalid name`);
  if (/\b(?:anthropic|claude)\b/i.test(data.name)) throw new Error(`${source}: name contains a reserved word`);
  if (/<[^>]*>/.test(data.name) || /<[^>]*>/.test(data.description)) throw new Error(`${source}: name and description cannot contain XML tags`);
  if (data.description.length > 1024) throw new Error(`${source}: description must be 1-1024 characters`);
  for (const key of ['license', 'compatibility']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length === 0)) throw new Error(`${source}: ${key} must be a non-empty string`);
  }
  if (data['allowed-tools'] !== undefined && (typeof data['allowed-tools'] !== 'string' || !data['allowed-tools'].trim() || data['allowed-tools'] !== data['allowed-tools'].trim())) throw new Error(`${source}: allowed-tools must be a non-empty trimmed string`);
  if (data['allowed-tools'] !== undefined && (!/^[^,\t\r\n]+(?: [^,\t\r\n]+)*$/.test(data['allowed-tools']) || data['allowed-tools'].includes('  '))) throw new Error(`${source}: allowed-tools must be a space-separated string`);
  if (data.compatibility?.length > 500) throw new Error(`${source}: compatibility exceeds 500 characters`);
  if (data.metadata !== undefined) {
    if (!data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata) || Object.keys(data.metadata).some(key => typeof key !== 'string') || Object.values(data.metadata).some(value => typeof value !== 'string')) throw new Error(`${source}: metadata must map string keys to string values`);
  }
  const platforms = data.metadata?.[PLATFORM_METADATA_KEY];
  if (platforms !== undefined) {
    const values = platforms.split(',').map(value => value.trim());
    if (!values.length || values.some(value => !value) || new Set(values).size !== values.length || values.some(value => !PLATFORMS.has(value))) throw new Error(`${source}: metadata.${PLATFORM_METADATA_KEY} must be a comma-separated unique list of windows, macos, linux`);
  }
  return { frontmatter: data, body: text.slice(match[0].length) };
}

export async function readSkill(skillDir) {
  const slug = path.basename(path.resolve(skillDir));
  if (!SLUG_RE.test(slug)) throw new Error(`invalid skill directory name: ${slug}`);
  const parsed = parseSkillMarkdown(await readFile(path.join(skillDir, 'SKILL.md'), 'utf8'), path.join(skillDir, 'SKILL.md'));
  if (parsed.frontmatter.name !== slug) throw new Error(`skill directory ${slug} does not match frontmatter name ${parsed.frontmatter.name}`);
  return { slug, ...parsed };
}

export async function schemaValidator(schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function assertValid(validate, value, label = 'data') {
  if (!validate(value)) throw new Error(`${label} schema validation failed: ${validate.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) args._.push(argv[i]);
    else { const [key, inline] = argv[i].slice(2).split('=', 2); args[key] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true); }
  }
  return args;
}

export function isMain(metaUrl) { return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(metaUrl)); }
