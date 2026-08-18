# Pull request

## Summary

<!-- What does this change and why? -->

## Skill changes

- Skill slug(s):
- Skill behavior:
- Agent Skills optional fields used (`license`, `compatibility`, `metadata`,
  `allowed-tools`):
- External services or dependencies:
- Credentials or permissions required:
- Added scripts, executable content, or network endpoints:
- Third-party content and redistribution license:

## Version increment

Apply exactly one PR label (do not merely check a box):

- `major` — incompatible behavior or contract change
- `minor` — backward-compatible functionality
- `patch` — backward-compatible fix or documentation/content correction

## Checklist

- [ ] Each changed Skill is under `skills/<slug>/` and has one root `SKILL.md`.
- [ ] I did not add a `manifest.json`; publishing generates it.
- [ ] `SKILL.md` uses only Agent Skills frontmatter fields: `name`,
  `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`.
- [ ] Platform metadata is omitted unless explicitly constrained.
- [ ] Licenses and sources permit redistribution.
- [ ] I disclosed scripts, network access, credentials, binaries, and other
  high-risk behavior.
- [ ] I selected exactly one of the `major`, `minor`, or `patch` labels.
