# Contributing to EchoSkillHub

EchoSkillHub accepts Skills through GitHub pull requests. Inclusion means the
repository checks and maintainers reviewed the contribution; it is not a
security certification.

## Submit a Skill

1. Fork the repository and create a branch.
2. Add or update `skills/<slug>/`.
3. Put exactly one `SKILL.md` at the Skill root. Its frontmatter must include
   `name` and `description`; `name` must equal `<slug>`. Portable optional fields
   are `license`, `compatibility`, `metadata`, and experimental `allowed-tools`.
4. Add a root `LICENSE` or `COPYING` when the declared license or redistributed
   material requires it, and identify each third-party source.
5. To declare catalog platforms, set the string metadata key
   `echoskillhub-platforms` to a comma-separated subset of `windows`, `macos`,
   and `linux`. Omit it when no platform constraint is declared.
6. Do **not** add `manifest.json`. The publisher generates it inside the ZIP.
7. Open a pull request using the template and apply exactly one label:
   `major`, `minor`, or `patch`.

A new Skill uses `0.0.0` as its version baseline. The selected label applies the
corresponding SemVer increment. Contributors do not write release versions.

## Version labels

- `major`: incompatible behavior or contract changes.
- `minor`: backward-compatible functionality.
- `patch`: backward-compatible fixes or content/documentation corrections.

A pull request that changes multiple Skills applies the same increment to each.
A missing or duplicate version label fails validation.

## Content requirements

Use portable relative paths. Symlinks, hard links, path traversal, case-folded
path collisions, secrets, generated files, and native executable content are
rejected. Keep dependencies and network behavior explicit in both `SKILL.md`
and the pull request. Never commit credentials or private data.

Deleting a published Skill directory is not a withdrawal mechanism. Contact the
maintainers to deprecate or revoke a release through the audited governance
process.

## Validation and review

The pull-request workflow has read-only repository permission. It installs the
locked Node dependencies, runs tests and repository checks, validates changed
Skills, and verifies the single version label. Maintainers additionally review
purpose, permission implications, external dependencies, provenance, license,
and the requested increment.

Run the checks exposed by `package.json` before requesting review. Markdown lint
may be run when the repository's lint command is available.

All required checks and CODEOWNERS review must pass. See
[repository settings](docs/REPOSITORY_SETTINGS.md) for GitHub settings that
maintainers must configure separately.
