import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const REPOSITORY = 'https://github.com/EchoWorker/EchoSkillHub';
export const SLUG_RE = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAG_RE = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PLATFORMS = new Set(['windows', 'macos', 'linux']);
export const PLATFORM_METADATA_KEY = 'echoskillhub-platforms';
export const CATEGORY_METADATA_KEY = 'category';
export const TAGS_METADATA_KEY = 'tags';
export const GENERIC_FORBIDDEN_TAGS = new Set(['ai', 'agent', 'skill', 'tool', 'utility']);
export const LICENSE_TAGS = new Set([
  'agpl', 'agpl-3-0', 'apache', 'apache-2-0', 'apache-license', 'bsd', 'bsd-2-clause',
  'bsd-3-clause', 'cc-by', 'cc-by-sa', 'cc0', 'creative-commons', 'gpl', 'gpl-2-0',
  'gpl-3-0', 'gplv2', 'gplv3', 'isc', 'license', 'lgpl', 'lgpl-2-1', 'lgpl-3-0',
  'mit', 'mit-license', 'mpl', 'mpl-2-0', 'proprietary', 'public-domain', 'unlicense'
]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_TAXONOMY_PATH = path.join(ROOT, 'taxonomy', 'categories.json');
export const DEFAULT_TAXONOMY_SCHEMA_PATH = path.join(ROOT, 'schemas', 'category-taxonomy.schema.json');

export function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }

/** Locale-independent comparison by ASCII/UTF-16 code unit. Taxonomy slugs are ASCII. */
export function compareAscii(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export const asciiCompare = compareAscii;

export function validateCategoryTaxonomy(taxonomy, source = 'taxonomy/categories.json') {
  if (!taxonomy || typeof taxonomy !== 'object' || Array.isArray(taxonomy) || taxonomy.schemaVersion !== 1 || !Array.isArray(taxonomy.categories)) {
    throw new Error(`${source}: invalid category taxonomy`);
  }
  const rootKeys = Object.keys(taxonomy);
  if (rootKeys.length !== 2 || !rootKeys.includes('schemaVersion') || !rootKeys.includes('categories')) throw new Error(`${source}: unexpected taxonomy field`);
  if (taxonomy.categories.length === 0) throw new Error(`${source}: taxonomy must contain at least one category`);
  const slugs = new Set();
  const orders = new Set();
  let previousOrder = -1;
  for (const [index, category] of taxonomy.categories.entries()) {
    if (!category || typeof category !== 'object' || Array.isArray(category)) throw new Error(`${source}: categories[${index}] must be an object`);
    const keys = Object.keys(category);
    const expected = ['slug', 'name', 'nameZhCN', 'description', 'order'];
    if (keys.length !== expected.length || expected.some(key => !keys.includes(key))) throw new Error(`${source}: categories[${index}] has missing or unexpected fields`);
    if (typeof category.slug !== 'string' || category.slug.length > 32 || !SLUG_RE.test(category.slug)) throw new Error(`${source}: invalid category slug at index ${index}`);
    for (const key of ['name', 'nameZhCN', 'description']) {
      if (typeof category[key] !== 'string' || category[key].length === 0) throw new Error(`${source}: categories[${index}].${key} must be non-empty text`);
    }
    if (!Number.isInteger(category.order) || category.order < 0) throw new Error(`${source}: categories[${index}].order must be a non-negative integer`);
    if (slugs.has(category.slug)) throw new Error(`${source}: duplicate category slug: ${category.slug}`);
    if (orders.has(category.order)) throw new Error(`${source}: duplicate category order: ${category.order}`);
    if (category.order <= previousOrder) throw new Error(`${source}: categories must be sorted by strictly increasing order`);
    slugs.add(category.slug);
    orders.add(category.order);
    previousOrder = category.order;
  }
  return taxonomy;
}
export const validateTaxonomy = validateCategoryTaxonomy;

export async function loadCategoryTaxonomy(taxonomyPath = DEFAULT_TAXONOMY_PATH, schemaPath = DEFAULT_TAXONOMY_SCHEMA_PATH) {
  let taxonomy;
  try { taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8')); } catch (error) { throw new Error(`${taxonomyPath}: cannot load category taxonomy: ${error.message}`); }
  const validate = await schemaValidator(schemaPath);
  assertValid(validate, taxonomy, taxonomyPath);
  return validateCategoryTaxonomy(taxonomy, taxonomyPath);
}
export const loadTaxonomy = loadCategoryTaxonomy;

export const CATEGORY_TAXONOMY = await loadCategoryTaxonomy();
export const CATEGORY_SLUGS = new Set(CATEGORY_TAXONOMY.categories.map(category => category.slug));
export const FORBIDDEN_TAGS = new Set([...GENERIC_FORBIDDEN_TAGS, ...PLATFORMS, ...CATEGORY_SLUGS]);

function categorySlugs(taxonomy) {
  if (taxonomy instanceof Set) return taxonomy;
  if (Array.isArray(taxonomy)) return new Set(taxonomy.map(value => typeof value === 'string' ? value : value.slug));
  if (taxonomy?.categories) return new Set(taxonomy.categories.map(category => category.slug));
  throw new TypeError('taxonomy must be a category taxonomy, category array, or slug Set');
}

function isVersionLookingTag(tag) {
  return /^(?:v|version-?)?\d+(?:-\d+)*(?:-(?:alpha|beta|rc)\d*)?$/.test(tag)
    || /^(?:alpha|beta|canary|dev|latest|lts|nightly|preview|rc|stable)(?:-?\d+)?$/.test(tag);
}

/** Parse mandatory EchoSkillHub metadata without normalizing contributor input. */
export function parseCategoryTags(metadata, taxonomy = CATEGORY_TAXONOMY, source = 'SKILL.md') {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`${source}: metadata.category and metadata.tags are required for Hub Skills`);
  const category = metadata[CATEGORY_METADATA_KEY];
  const tagsText = metadata[TAGS_METADATA_KEY];
  if (typeof category !== 'string' || !category) throw new Error(`${source}: metadata.category is required and must be a non-empty string`);
  const categories = categorySlugs(taxonomy);
  if (!categories.has(category)) throw new Error(`${source}: metadata.category is not in the category taxonomy: ${category}`);
  if (typeof tagsText !== 'string' || !tagsText) throw new Error(`${source}: metadata.tags is required and must be a non-empty string`);
  if (/\s/.test(tagsText)) throw new Error(`${source}: metadata.tags must be a canonical comma-separated string with no whitespace`);
  const tags = tagsText.split(',');
  if (tags.length < 1 || tags.length > 8 || tags.some(tag => !tag)) throw new Error(`${source}: metadata.tags must contain 1-8 tags`);
  for (const tag of tags) {
    if (tag.length > 32 || !TAG_RE.test(tag)) throw new Error(`${source}: invalid metadata.tags tag (lowercase kebab-case, max 32 ASCII characters): ${tag}`);
    if (FORBIDDEN_TAGS.has(tag) || categories.has(tag)) throw new Error(`${source}: metadata.tags contains forbidden generic, platform, or category tag: ${tag}`);
    if (LICENSE_TAGS.has(tag)) throw new Error(`${source}: metadata.tags must not contain license terms: ${tag}`);
    if (isVersionLookingTag(tag)) throw new Error(`${source}: metadata.tags must not contain version-looking or release-channel tags: ${tag}`);
  }
  if (new Set(tags).size !== tags.length) throw new Error(`${source}: metadata.tags must be unique`);
  const sorted = tags.slice().sort(compareAscii);
  if (tags.some((tag, index) => tag !== sorted[index])) throw new Error(`${source}: metadata.tags must be ASCII sorted`);
  return { category, tags };
}

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
  parseCategoryTags(data.metadata, CATEGORY_TAXONOMY, source);
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
