# Contributing to EchoSkillHub

EchoSkillHub accepts Skills through pull requests. Inclusion means repository
checks and maintainers reviewed a contribution; it is not a security
certification.

## Submit a Skill

1. Add or update `skills/<slug>/` with exactly one root `SKILL.md`. Frontmatter
   `name` must equal the lowercase kebab-case slug.
2. Use portable Agent Skills fields. Although `metadata` is optional in the
   generic specification, EchoSkillHub requires these string entries:

   ```yaml
   metadata:
     category: developer-tools
     tags: documentation,link-checking,markdown
   ```

3. Choose one category from the controlled taxonomy in
   `taxonomy/categories.json`: `automation`, `business`, `communication`,
   `data`, `design`, `developer-tools`, `documents`, `education`,
   `infrastructure`, `media`, `productivity`, `research`, or `security`.
4. Supply 1–8 unique lowercase kebab-case tags as a comma-separated string with
   no spaces, sorted lexicographically. Tags use an open vocabulary and remain
   subject to validation and review.
5. Use the canonical metadata keys `category` and `tags` exactly.
6. Optionally declare `metadata.echoskillhub-platforms` as a comma-separated
   subset of `windows`, `macos`, and `linux`. Omission means not declared.
7. Add a root `LICENSE` or `COPYING` when required and identify third-party
   sources. Do not add `manifest.json`; publishing generates it inside the ZIP.
8. Open a pull request using the template and apply exactly one `major`, `minor`,
   or `patch` label.

New Skills use `0.0.0` as their version baseline. Contributors do not write the
release version. A pull request changing multiple Skills applies the same
increment to each.

## Content and review

Use portable relative paths. Symlinks, hard links, path traversal, case-folded
path collisions, secrets, generated files, and prohibited native executable
content are rejected. Disclose dependencies, scripts, network behavior,
credentials, permissions, provenance, and redistribution rights.

Run the checks exposed by `package.json` before requesting review:

```powershell
npm ci
npm run check
```

The pull-request workflow is read-only. All required checks and CODEOWNERS review
must pass. Deleting a published Skill is not a withdrawal mechanism; contact the
maintainers for the audited governance process.

## Generated outputs

Category and tags become required first-class fields in generated Manifest v1
and Registry v1. A Registry Skill with a recommended `latest` version has a
top-level `downloadUrl` matching that version. The publisher generates
`categories.json`, `tags.json`, and `registry.json` together and atomically
deploys them as one Pages artifact.

See [repository settings](docs/REPOSITORY_SETTINGS.md) for GitHub settings that
maintainers configure separately.
