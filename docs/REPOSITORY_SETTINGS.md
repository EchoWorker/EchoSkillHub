# Repository settings

Committed workflows and ownership rules do not enable GitHub-hosted settings.
Maintainers must configure the following controls.

## Labels and rulesets

Create exactly three lowercase version labels: `major`, `minor`, and `patch`.
Skill pull requests require exactly one.

Protect `main` with a ruleset that:

- requires pull requests, at least one approval, and CODEOWNERS approval;
- dismisses stale approvals and requires conversation resolution;
- requires the current `Validate / validate` check;
- blocks direct pushes, force pushes, and deletion;
- restricts bypass to the smallest maintainer group.

Protect release tags matching `*-v*` from update or deletion, restrict Release
deletion, and retain audit logs.

## Actions

Under **Actions > General**:

- permit only required actions and prefer organization full-SHA policy;
- keep the default workflow token read-only;
- do not allow Actions to approve pull requests.

Committed workflows grant write permission only to their dedicated release or
Pages jobs.

## GitHub Pages and environment

1. Select **GitHub Actions** as the Pages source.
2. Keep or create the `github-pages` environment and restrict deployment to the
   default branch/workflow.
3. Optionally require designated maintainer approval.
4. Verify all three public URLs:
   - `https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json`
   - `https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json`
   - `https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json`

Do not publish the checked-in `registry/` directory directly. The workflow must
generate and upload categories, tags, and registry in one Pages artifact so the
public catalog changes atomically.

## Verification and recovery

Use the `Publish skills` manual dispatch only to rebuild and redeploy after a
partial failure; never overwrite a tag or Release asset. After setup, test a
non-release pull request and a fixture release. Verify required checks, taxonomy
validation, tag protection, asset immutability, all three JSON resources, and
atomic Pages deployment before accepting public contributions.
