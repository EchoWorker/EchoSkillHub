# EchoSkillHub

English | [简体中文](README.zh-CN.md)

EchoSkillHub is a GitHub-native registry for publishing versioned Skills. GitHub
Actions validates and packages contributions, GitHub Releases stores immutable
ZIP assets, and GitHub Pages serves the generated registry.

## Agent Skills format

EchoSkillHub accepts the portable Agent Skills frontmatter shared by Claude Code,
claude.ai uploads, and the Skills API:

| Field | Required | Constraints |
| --- | --- | --- |
| `name` | Yes | 1–64 lowercase letters, digits, hyphens; matches directory |
| `description` | Yes | 1–1024 characters; says what it does and when to use it |
| `license` | No | Short license name or bundled license-file reference |
| `compatibility` | No | 1–500 character environment requirements |
| `metadata` | No | String-key to string-value map |
| `allowed-tools` | No | Space-separated pre-approved tools; experimental |

Claude Code-only fields such as `argument-hint`, `disable-model-invocation`,
`user-invocable`, `model`, `context`, and `agent` are intentionally rejected
because claude.ai and Skills API uploads reject them. See the
[Agent Skills specification](https://agentskills.io/specification) and
[Claude Code portability table](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code).

## Submit a new Skill

1. Fork this repository and create a branch.
2. Create `skills/<slug>/`. The slug must use lowercase letters, digits, and
   hyphens, and must match the `name` in `SKILL.md`.
3. Add one root `SKILL.md` with YAML frontmatter:

   ```yaml
   ---
   name: my-skill
   description: Explains what this Skill does and when an agent should use it.
   license: MIT # optional
   compatibility: Requires Python 3.12 and internet access. # optional
   metadata: # optional; string keys and string values
     author: example-org
     version: "1.0"
     echoskillhub-platforms: windows,macos,linux # optional Hub catalog hint
   allowed-tools: Read Grep # optional and experimental
   ---

   # My Skill

   Skill instructions go here.
   ```

4. Add a root `LICENSE` or `COPYING` file when the optional `license` field or
   redistributed content requires one. Any redistributed scripts, references, or
   assets must permit redistribution and identify their source.
5. Add optional content under `references/`, `scripts/`, `assets/`, or `evals/`.
   Do not add `manifest.json`; the publishing workflow generates it inside the
   release ZIP.
6. Run the repository checks:

   ```powershell
   npm ci
   npm run check
   ```

7. Open a pull request with the template. Describe external services, network
   access, credentials, scripts, and third-party content.
8. Apply exactly one version label. For a new Skill, use `minor` for the normal
   first release, producing version `0.1.0`. Use `major` only when the first
   public contract intentionally starts at `1.0.0`, or `patch` for `0.0.1`.

## Update an existing Skill

1. Edit only the relevant `skills/<slug>/` files. Keep the directory slug and
   frontmatter `name` unchanged; renaming creates a different Skill.
2. Update `SKILL.md`, supporting files, and license/source information together.
3. Run `npm ci` and `npm run check`.
4. Open a pull request and apply exactly one SemVer label:
   - `major`: incompatible behavior or contract changes;
   - `minor`: backward-compatible functionality;
   - `patch`: backward-compatible fixes or content/documentation corrections.
5. After merge, the workflow calculates the next version, generates
   `manifest.json`, creates `<slug>-v<version>`, uploads
   `<slug>-<version>.zip`, and rebuilds the public registry.

A pull request that changes multiple Skills applies the same version increment to
all of them. Published versions are immutable; corrections always require a new
version. Do not delete a published Skill to withdraw it—ask maintainers to use the
reviewed deprecation or revocation process.

## Contribution rules

- Frontmatter follows the portable Agent Skills specification. `name` and
  `description` are required. The only optional fields are `license`,
  `compatibility`, `metadata`, and experimental `allowed-tools`.
- Hub platform filtering uses the string metadata key
  `metadata.echoskillhub-platforms`, with a comma-separated subset of `windows`,
  `macos`, and `linux`. Omission means “not declared,” not “all platforms.”
- Portable relative paths are required. Links, path traversal, case-insensitive
  collisions, secrets, generated manifests, and prohibited executable content
  are rejected.
- Registry inclusion, review, scanning, and checksums are not a security
  certification.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete policy and review
  requirements.

## Distribution

Each Skill has independent SemVer coordinates:

```text
tag:   <slug>-v<version>
asset: <slug>-<version>.zip
```

The public v1 registry is deployed at:

```text
https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json
```

## Documentation

- [中文说明](README.zh-CN.md)
- [Contribution guide](CONTRIBUTING.md)
- [Repository design](docs/DESIGN.md)
- [Security policy](SECURITY.md)
- [Required GitHub repository settings](docs/REPOSITORY_SETTINGS.md)

Branch rulesets, version labels, Pages, environments, and other remote GitHub
settings must still be configured by maintainers.
