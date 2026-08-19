# Pull request

## Summary

<!-- What does this change and why? -->

## Skill changes

- Skill slug(s):
- Skill behavior:
- `metadata.category`:
- `metadata.tags` (1–8, comma-separated, unique, sorted):
- External services or dependencies:
- Credentials or permissions required:
- Scripts, executable content, or network endpoints:
- Third-party content and redistribution license:

## Version increment

Apply exactly one PR label:

- `major` — incompatible behavior or contract change
- `minor` — backward-compatible functionality
- `patch` — backward-compatible fix or documentation/content correction

## Checklist

- [ ] Each changed Skill has one root `SKILL.md`; its name matches its slug.
- [ ] `metadata.category` is one of the 13 controlled taxonomy slugs.
- [ ] `metadata.tags` contains 1–8 sorted lowercase kebab-case tags.
- [ ] I used the canonical metadata keys `category` and `tags` exactly.
- [ ] I did not add `manifest.json`; publishing generates it.
- [ ] Platform metadata is omitted unless explicitly constrained.
- [ ] Licenses and sources permit redistribution.
- [ ] I disclosed scripts, network access, credentials, binaries, and other
  high-risk behavior.
- [ ] I selected exactly one `major`, `minor`, or `patch` label.
