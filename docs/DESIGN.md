# EchoSkillHub GitHub repository design

> Status: implemented repository contract; remote settings in
> `REPOSITORY_SETTINGS.md` still require maintainer configuration.

## Architecture and facts

EchoSkillHub is a static, GitHub-native registry with no database or long-running
service:

```text
Pull request -> validation -> immutable Release ZIP
                                -> generated catalog -> atomic Pages deployment
```

| Information | Source of truth |
| --- | --- |
| Skill content and metadata | Reviewed `skills/<slug>/SKILL.md` |
| Controlled categories | `taxonomy/categories.json` |
| Version increment | One `major`, `minor`, or `patch` PR label |
| Published versions | GitHub Releases |
| Manifest | Generated and embedded in the ZIP |
| Public catalog | Rebuilt from verified Release facts |

Contributors do not submit `manifest.json` or numeric versions.

## Skill and metadata contract

Frontmatter follows the portable Agent Skills specification. Generic Agent
Skills require `name` and `description`; `license`, `compatibility`, `metadata`,
and experimental `allowed-tools` are optional. EchoSkillHub makes two entries
within the otherwise optional string map mandatory for Hub publication:

- `metadata.category`: one of the 13 slugs in `taxonomy/categories.json`;
- `metadata.tags`: 1–8 unique lowercase kebab-case tags, comma-separated without
  spaces and sorted lexicographically.

The controlled categories are `automation`, `business`, `communication`, `data`,
`design`, `developer-tools`, `documents`, `education`, `infrastructure`, `media`,
`productivity`, `research`, and `security`. Tags are an open vocabulary. The
canonical metadata keys are exactly `category` and `tags`.

Optional platform filtering remains `metadata.echoskillhub-platforms`, a
comma-separated unique subset of `windows`, `macos`, and `linux`.

## Manifest and package

Publishing computes SemVer and generates Manifest v1. Category and tags are
required, strongly typed first-class Manifest fields derived from the reviewed
metadata strings. The generated object is schema-validated and added only to the
ZIP, while source metadata remains available for auditing.

```text
tag:   <slug>-v<version>
asset: <slug>-<version>.zip
```

The ZIP has no wrapping directory and is built deterministically. Published
`slug + version` coordinates are immutable; conflicts fail closed, and fixes
require a new release.

## Registry and public discovery

Registry v1 is rebuilt from verified GitHub Releases. Each Skill record exposes
first-class `category` and `tags`. When a recommended version exists, top-level
`latest` and `downloadUrl` identify it directly; the URL must equal the matching
`versions[].downloadUrl`. A fully revoked Skill has neither field.

Pages publishes these stable URLs:

- `https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json`
- `https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json`
- `https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json`

`categories.json` is generated from the controlled taxonomy and includes all 13
categories, including empty ones. `tags.json` is a generated discovery index of
tags used by active Skills. All three files share one generation and are
uploaded in a single Pages artifact, so deployment is atomic.

Category deprecation and `replacedBy` are reserved for a future contract; they
are not implemented in v1.

## Validation, publishing, and recovery

Pull-request validation runs with `contents: read`, verifies the single version
label, validates changed Skills and catalog metadata, runs repository checks,
and exercises deterministic packaging. Human review covers purpose, behavior,
permissions, dependencies, provenance, licensing, scripts, and network access.

Publishing runs only for a merged pull request targeting `main`, checks out the
trusted merge commit, revalidates it, and publishes changed Skills independently.
The release job alone has `contents: write`; registry construction is read-only;
the Pages deployment job alone has `pages: write` and `id-token: write`.
Third-party actions are pinned and publishes serialize without cancellation.

Release assets are created before catalog generation. If catalog construction or
Pages deployment fails, the previous public artifact remains. Manual dispatch
rebuilds from existing releases without overwriting immutable history.

Remote branch rules, labels, tag protection, Pages source, environment policy,
and organization Actions policy are not enabled by repository files. Maintainers
must apply [Repository settings](REPOSITORY_SETTINGS.md).
