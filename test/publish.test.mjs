import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publishSkill } from '../scripts/publish-skill.mjs';
import { fixture, commit } from './helpers/fixtures.mjs';

class MockApi {
  constructor({ ref = null, release = null, uploadFailure = false } = {}) {
    this.ref = ref; this.release = release; this.uploadFailure = uploadFailure; this.bytes = new Map(); this.calls = [];
  }
  notFound() { const e = new Error('not found'); e.status = 404; throw e; }
  async getRef(tag) { this.calls.push(['getRef', tag]); return this.ref ?? this.notFound(); }
  async getReleaseByTag(tag) { this.calls.push(['getReleaseByTag', tag]); return this.release ?? this.notFound(); }
  async createRef(tag, sha) { this.calls.push(['createRef', tag, sha]); this.ref = { object: { sha } }; return this.ref; }
  async createRelease(tag, sha) { this.calls.push(['createRelease', tag, sha]); this.release = { tag_name: tag, target_commitish: sha, upload_url: 'https://uploads.invalid/{?name,label}', assets: [] }; return this.release; }
  async uploadAsset(url, name, bytes) {
    this.calls.push(['uploadAsset', name]);
    if (this.uploadFailure) throw new Error('simulated interrupted upload');
    const asset = { name, size: bytes.length, url: `mock://${name}`, browser_download_url: `https://example.invalid/${name}` };
    this.bytes.set(asset.url, Buffer.from(bytes)); this.release.assets.push(asset); return asset;
  }
  async downloadAsset(asset) { this.calls.push(['downloadAsset', asset.name]); return this.bytes.get(asset.url) ?? Buffer.alloc(asset.size, 0); }
}

async function firstPublish(api = new MockApi()) {
  const result = await publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api });
  return { api, result };
}

test('publish creates immutable release and is idempotent on exact retry', async () => {
  const { api, result } = await firstPublish();
  assert.equal(result.reused, false);
  const retried = await publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api });
  assert.equal(retried.reused, true);
  assert.equal(api.calls.filter(([name]) => name === 'uploadAsset').length, 1);
});

test('publish rejects tag commit conflict', async () => {
  const api = new MockApi({ ref: { object: { sha: 'b'.repeat(40) } } });
  await assert.rejects(publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api }), /different commit/);
});

test('publish rejects immutable asset size and digest conflicts', async () => {
  const tag = 'unspecified-platforms-v1.0.0';
  const filename = 'unspecified-platforms-1.0.0.zip';
  const sizeApi = new MockApi({ ref: { object: { sha: commit } }, release: { assets: [{ name: filename, size: 1, url: 'mock://bad' }] } });
  await assert.rejects(publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api: sizeApi }), /different size/);
  const { api, result } = await firstPublish();
  api.bytes.set(result.asset.url, Buffer.alloc(result.size, 7));
  await assert.rejects(publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api }), /different digest/);
});

test('partial recovery reuses existing ref and creates missing release/asset', async () => {
  const api = new MockApi({ ref: { object: { sha: commit } } });
  const result = await publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api });
  assert.equal(result.reused, false);
  assert.equal(api.calls.some(([name]) => name === 'createRef'), false);
  assert.equal(api.calls.some(([name]) => name === 'createRelease'), true);
});

test('partial upload failure leaves retry recoverable', async () => {
  const api = new MockApi({ uploadFailure: true });
  await assert.rejects(publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api }), /interrupted/);
  assert(api.ref && api.release);
  api.uploadFailure = false;
  const result = await publishSkill({ skillDir: fixture('unspecified-platforms'), version: '1.0.0', sourceCommit: commit, api });
  assert.equal(result.reused, false);
});
