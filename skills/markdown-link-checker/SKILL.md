---
name: markdown-link-checker
description: Audits Markdown links, reports broken local references and malformed URLs, and suggests precise fixes. Use when reviewing README files, documentation links, relative paths, anchors, or Markdown navigation before publishing.
license: MIT
compatibility: Requires Python 3.9 or later. Network access is optional and used only when checking remote URLs.
metadata:
  author: EchoWorker
  version: "1.0"
  category: developer-tools
  tags: documentation,link-checking,markdown
  echoskillhub-platforms: windows,macos,linux
allowed-tools: Read Grep
---

# Markdown Link Checker

Audit links without modifying files unless the user asks for fixes.

## Workflow

1. Identify the Markdown files in scope.
2. Extract inline links, reference-style links, images, and local anchors. Record the source line for every finding so the user can act on it immediately.
3. Resolve relative paths from the directory containing each Markdown file.
4. Check local targets first:
   - Report missing files and directories.
   - Verify `#fragment` anchors against headings in the target Markdown file.
   - Treat URL-encoded paths consistently when resolving files.
5. Check remote URLs only when network access is available and requested:
   - Prefer `HEAD`; retry with `GET` when the server rejects `HEAD`.
   - Follow bounded redirects.
   - Report authentication or rate-limit responses separately from broken links.
6. Return findings grouped by file and severity.

## Report format

```markdown
# Markdown link audit

## Broken
- `docs/guide.md:24` — `[Setup](setup.md)` points to a missing file.

## Warnings
- `README.md:18` — remote URL returned HTTP 429; retry later.

## Validated
- 17 local links
- 8 anchors
- 5 remote URLs
```

Include the original link, source file and line, failure reason, and the smallest
safe correction. Do not claim remote links were validated when network checks did
not run.
