# EchoSkillHub

English | [简体中文](README.zh-CN.md)

EchoSkillHub is a GitHub-native registry for versioned Agent Skills. GitHub
Actions validates and packages contributions, GitHub Releases stores immutable
ZIP assets, and GitHub Pages atomically publishes the generated catalog.

## Hub Skill contract

EchoSkillHub uses portable Agent Skills frontmatter. The generic specification
requires `name` and `description` and makes `license`, `compatibility`,
`metadata`, and experimental `allowed-tools` optional. The Hub imposes an
additional publication contract: when publishing here, `metadata` must contain
the string keys `category` and `tags`.

```yaml
---
name: my-skill
description: Explains what this Skill does and when an agent should use it.
license: MIT # optional
compatibility: Requires Python 3.12 and internet access. # optional
metadata:
  category: developer-tools
  tags: documentation,link-checking,markdown
  author: example-org # optional
  echoskillhub-platforms: windows,macos,linux # optional
allowed-tools: Read Grep # optional and experimental
---
```

`metadata.category` must be exactly one of these 13 controlled slugs:

- `automation`, `business`, `communication`, `data`, `design`
- `developer-tools`, `documents`, `education`, `infrastructure`, `media`
- `productivity`, `research`, `security`

`metadata.tags` is a canonical comma-separated string of 1–8 unique lowercase
kebab-case tags, sorted lexicographically, with no spaces. Category definitions
come from `taxonomy/categories.json`; tags are an open vocabulary subject to
review. The canonical metadata keys are exactly `category` and `tags`.

A Skill without these keys can remain valid under the generic Agent Skills
specification, but it cannot be published by EchoSkillHub.

## Submit or update a Skill

1. Fork the repository and create a branch.
2. Add or edit `skills/<slug>/SKILL.md`. The lowercase kebab-case directory slug
   must match frontmatter `name`.
3. Add supporting content under `references/`, `scripts/`, `assets/`, or
   `evals/` as needed. Include a root `LICENSE` or `COPYING` when required, and
   identify redistributable third-party sources.
4. Do not add `manifest.json`; publishing generates it inside the Release ZIP.
5. Run:

   ```powershell
   npm ci
   npm run check
   ```

6. Open a pull request using the template and disclose external services,
   network access, credentials, scripts, and third-party content.
7. Apply exactly one SemVer label: `major`, `minor`, or `patch`. New Skills use
   `0.0.0` as their baseline, so the normal `minor` first release is `0.1.0`.

Published versions are immutable. A pull request changing multiple Skills
applies the same increment to each. Renaming a slug creates a different Skill.

## Generated distribution contract

Publishing promotes category and tags to required, strongly typed first-class
fields in generated Manifest v1 and Registry v1 records. Registry Skill records
also expose the recommended version as top-level `latest` and its direct
`downloadUrl`; historical downloads remain in `versions[].downloadUrl`.

Each release uses:

```text
tag:   <slug>-v<version>
asset: <slug>-<version>.zip
```

The three public JSON resources are generated together and deployed in one
atomic Pages artifact:

- <https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json>

## Contribution rules

Portable relative paths are required. Links, path traversal, case-insensitive
collisions, secrets, generated manifests, and prohibited executable content are
rejected. Registry inclusion, review, scanning, and checksums are not a security
certification. See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete policy.

## Documentation

- [中文说明](README.zh-CN.md)
- [Contribution guide](CONTRIBUTING.md)
- [Category and tag contract](docs/CATEGORY_TAGS_DESIGN.md)
- [Repository design](docs/DESIGN.md)
- [Security policy](SECURITY.md)
- [Required GitHub repository settings](docs/REPOSITORY_SETTINGS.md)
