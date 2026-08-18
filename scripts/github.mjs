export class GitHubApi {
  constructor({ owner = 'EchoWorker', repo = 'EchoSkillHub', token = process.env.GITHUB_TOKEN, fetchImpl = globalThis.fetch } = {}) {
    this.owner = owner; this.repo = repo; this.token = token; this.fetch = fetchImpl;
  }
  async request(method, endpoint, { body, headers = {}, raw = false } = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com/repos/${this.owner}/${this.repo}${endpoint}`;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetch(url, { method, signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }) });
        if (response.ok) {
          if (raw) return Buffer.from(await response.arrayBuffer());
          return response.status === 204 ? null : response.json();
        }
        const text = await response.text();
        const error = new Error(`GitHub ${method} ${endpoint}: ${response.status} ${text}`); error.status = response.status;
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) throw error;
        lastError = error;
      } catch (error) {
        if (error.status || attempt === 2) throw error;
        lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
    }
    throw lastError;
  }
  listReleases() { return this.paginate('/releases?per_page=100'); }
  getReleaseByTag(tag) { return this.request('GET', `/releases/tags/${encodeURIComponent(tag)}`); }
  getRef(tag) { return this.request('GET', `/git/ref/tags/${encodeURIComponent(tag)}`); }
  createRef(tag, sha) { return this.request('POST', '/git/refs', { body: { ref: `refs/tags/${tag}`, sha } }); }
  createRelease(tag, sha, name = tag, body = '') { return this.request('POST', '/releases', { body: { tag_name: tag, target_commitish: sha, name, body, draft: false, prerelease: false } }); }
  uploadAsset(uploadUrl, name, bytes) { return this.request('POST', `${uploadUrl.replace('{?name,label}', '')}?name=${encodeURIComponent(name)}`, { body: bytes, headers: { 'Content-Type': 'application/zip', 'Content-Length': String(bytes.length) } }); }
  downloadAsset(asset) { return this.request('GET', asset.url, { headers: { Accept: 'application/octet-stream' }, raw: true }); }
  async paginate(endpoint) {
    const result = []; let page = 1;
    while (true) { const join = endpoint.includes('?') ? '&' : '?'; const items = await this.request('GET', `${endpoint}${join}page=${page}`); result.push(...items); if (items.length < 100) return result; page++; }
  }
}

async function absent(fn) { try { return await fn(); } catch (e) { if (e.status === 404) return null; throw e; } }
export async function publishImmutable({ api, slug, version, sourceCommit, filename, bytes, sha256 }) {
  const tag = `${slug}-v${version}`;
  const releaseBody = `<!-- skillhub-release-v1\n${JSON.stringify({ slug, version, sourceCommit, sha256, size: bytes.length })}\n-->`;
  const ref = await absent(() => api.getRef(tag));
  if (ref && ref.object.type && ref.object.type !== 'commit') throw new Error(`tag ${tag} must be a lightweight commit tag`);
  if (ref && ref.object.sha !== sourceCommit) throw new Error(`tag ${tag} exists at a different commit`);
  let release = await absent(() => api.getReleaseByTag(tag));
  if (!ref) await api.createRef(tag, sourceCommit);
  if (!release) release = await api.createRelease(tag, sourceCommit, tag, releaseBody);
  if (release.target_commitish && /^[0-9a-f]{40}$/.test(release.target_commitish) && release.target_commitish !== sourceCommit) throw new Error(`release ${tag} targets a different commit`);
  let asset = release.assets.find(a => a.name === filename);
  if (asset) {
    if (asset.size !== bytes.length) throw new Error(`immutable asset ${filename} has different size`);
    const existing = await api.downloadAsset(asset);
    const { createHash } = await import('node:crypto');
    if (createHash('sha256').update(existing).digest('hex') !== sha256) throw new Error(`immutable asset ${filename} has different digest`);
    return { tag, release, asset, reused: true };
  }
  asset = await api.uploadAsset(release.upload_url, filename, bytes);
  if (asset.size !== bytes.length) throw new Error('uploaded asset size mismatch');
  return { tag, release, asset, reused: false };
}
