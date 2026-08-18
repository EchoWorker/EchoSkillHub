# Repository settings

The workflows and ownership rules are committed, but the following GitHub-hosted
settings remain manual. A file change alone does not enable them.

## Labels

Create exactly these version labels with these exact lowercase names:

- `major`
- `minor`
- `patch`

The validation and publishing workflows reject a Skill pull request unless
exactly one is present.

## Ruleset for `main`

Create a branch ruleset for the default branch that:

- requires pull requests and blocks direct and force pushes;
- requires at least one approval and CODEOWNERS approval;
- dismisses stale approvals when new commits are pushed;
- requires conversation resolution;
- requires the `Validate / validate` status check;
- requires the branch to be current before merge;
- restricts bypass and deletion to the smallest maintainer group.

Also protect release tags matching `*-v*` from deletion or update. Restrict
release deletion to designated maintainers and retain GitHub audit logs.

## Actions

Under **Actions > General**:

- permit only required actions, including GitHub-owned actions used here;
- keep the default workflow token permission read-only;
- do not allow Actions to approve pull requests;
- require full-SHA pinning through policy where the organization supports it.

The committed workflows still declare explicit permissions. Validation is
read-only. The release job alone receives `contents: write`; registry building is
read-only; the Pages deployment job alone receives `pages: write` and
`id-token: write`.

## GitHub Pages and environment

1. Enable Pages with **GitHub Actions** as its source.
2. Keep or create the `github-pages` environment.
3. Restrict its deployment branch/tag policy to the default branch/workflow.
4. Optionally require designated maintainer approval for production deployment.
5. Confirm the published URL is
   `https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json`.

Do not configure Pages to publish the checked-in `registry/` directory directly;
the workflow uploads and atomically deploys the complete generated site artifact.

## Publishing and recovery

The normal publisher runs only when a pull request targeting `main` is merged.
Its repository-level concurrency group does not cancel an in-progress publish.
Use the `Publish skills` workflow's manual dispatch only to rebuild and redeploy
the registry after a partial failure. Manual recovery must not overwrite an
existing tag or release asset.

After configuring these settings, test with a non-release pull request, then a
fixture Skill release. Verify required checks, tag protection, Release asset
immutability, and the Pages URL before accepting public contributions.
