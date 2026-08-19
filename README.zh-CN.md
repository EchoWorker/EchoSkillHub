# EchoSkillHub

[English](README.md) | 简体中文

EchoSkillHub 是一个基于 GitHub 原生能力构建的版本化 Agent Skills 仓库。GitHub
Actions 负责校验和打包，GitHub Releases 保存不可变 ZIP，GitHub Pages 原子发布
自动生成的目录。

## Hub Skill 契约

EchoSkillHub 使用可移植的 Agent Skills frontmatter。通用规范要求 `name` 和
`description` 必填，`license`、`compatibility`、`metadata` 和实验性的
`allowed-tools` 可选。Hub 另有发布要求：在本仓库发布时，`metadata` 必须包含
字符串键 `category` 和 `tags`。

```yaml
---
name: my-skill
description: 说明这个 Skill 做什么，以及 Agent 应在什么情况下使用它。
license: MIT # 可选
compatibility: 需要 Python 3.12 和网络访问。 # 可选
metadata:
  category: developer-tools
  tags: documentation,link-checking,markdown
  author: example-org # 可选
  echoskillhub-platforms: windows,macos,linux # 可选
allowed-tools: Read Grep # 可选，实验性字段
---
```

`metadata.category` 必须且只能是以下 13 个受控 slug 之一：

- `automation`、`business`、`communication`、`data`、`design`
- `developer-tools`、`documents`、`education`、`infrastructure`、`media`
- `productivity`、`research`、`security`

`metadata.tags` 是规范的逗号分隔字符串：包含 1–8 个不重复的小写 kebab-case
标签，按字典序排列且不得有空格。分类定义以 `taxonomy/categories.json` 为事实源；
标签采用开放词表，但须通过校验和审核。规范 metadata 键仅为 `category` 和
`tags`。

缺少这两个键的 Skill 仍可能符合通用 Agent Skills 规范，但不能发布到
EchoSkillHub。

## 提交或更新 Skill

1. Fork 本仓库并创建分支。
2. 新建或修改 `skills/<slug>/SKILL.md`。小写 kebab-case 目录 slug 必须与
   frontmatter `name` 一致。
3. 按需添加 `references/`、`scripts/`、`assets/` 或 `evals/`。许可要求存在时，
   添加根目录 `LICENSE` 或 `COPYING`，并标明允许再分发的第三方来源。
4. 不要提交 `manifest.json`；发布流程会在 Release ZIP 内生成它。
5. 运行：

   ```powershell
   npm ci
   npm run check
   ```

6. 使用模板创建 Pull Request，披露外部服务、网络访问、凭证、脚本及第三方内容。
7. 添加且只添加一个 SemVer 标签：`major`、`minor` 或 `patch`。新 Skill 以
   `0.0.0` 为基线，通常选择 `minor`，首次版本为 `0.1.0`。

已发布版本不可变。一个 PR 修改多个 Skill 时，同一版本增量应用到每个 Skill。
修改 slug 会创建另一个 Skill。

## 生成的分发契约

发布流程会把 category 和 tags 提升为生成的 Manifest v1 与 Registry v1 中必填、
强类型的一等字段。Registry 的 Skill 顶层记录还提供推荐版本 `latest` 及其直接
`downloadUrl`；历史版本地址保留在 `versions[].downloadUrl`。

每个 Release 使用：

```text
tag:   <slug>-v<version>
asset: <slug>-<version>.zip
```

以下三个公开 JSON 资源同时生成，并通过同一个 Pages artifact 原子部署：

- <https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json>

## 贡献规则

文件路径必须可移植。链接、路径逃逸、大小写冲突、凭证、手工提交的 Manifest
以及禁止的可执行内容都会被拒绝。被收录、通过审核、扫描或 SHA-256 校验，都不
等于安全认证。完整政策见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 文档

- [English README](README.md)
- [贡献指南](CONTRIBUTING.md)
- [分类与标签契约](docs/CATEGORY_TAGS_DESIGN.md)
- [仓库设计](docs/DESIGN.md)
- [安全策略](SECURITY.md)
- [GitHub 仓库设置清单](docs/REPOSITORY_SETTINGS.md)
