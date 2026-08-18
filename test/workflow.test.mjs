import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './helpers/fixtures.mjs';

const readWorkflow = name => readFile(path.join(root, '.github/workflows', name), 'utf8');
const pinnedActions = text => [...text.matchAll(/uses:\s*([^\s#]+)/g)].map(m => m[1]);

test('package config exposes the Node test runner suite used by CI', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts?.test ?? '', /node\s+--test/);
});

test('validation workflow is unprivileged, validates changes, and runs tests', async () => {
  const workflow = await readWorkflow('validate.yml');
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /contents: write|pages: write|id-token: write/);
  assert.match(workflow, /getChangedSkills/);
  assert.match(workflow, /validateVersionLabels/);
  assert.match(workflow, /validateSkill/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /persist-credentials: false/);
});

test('publish workflow gates untrusted event and separates release, registry, Pages permissions', async () => {
  const workflow = await readWorkflow('publish-skill.yml');
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /merged == true/);
  assert.match(workflow, /base\.ref == 'main'/);
  assert.match(workflow, /group: skillhub-publish\s*\n\s*cancel-in-progress: false/);
  assert.match(workflow, /prepare:[\s\S]*?permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /release:[\s\S]*?permissions:\s*\n\s*contents: write/);
  assert.match(workflow, /registry:[\s\S]*?permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /pages:[\s\S]*?permissions:\s*\n\s*pages: write\s*\n\s*id-token: write/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /"governance\/\*\*"/);
  assert.match(workflow, /needs\.release\.result == 'skipped'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.merge_commit_sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /check-registry\.mjs .*--online/);
});

test('all third-party workflow actions are pinned to full commit SHAs', async () => {
  for (const name of ['validate.yml', 'publish-skill.yml']) {
    const actions = pinnedActions(await readWorkflow(name));
    assert(actions.length > 0);
    for (const action of actions) assert.match(action, /^[^@\s]+@[0-9a-f]{40}$/, `${name}: ${action}`);
  }
});
