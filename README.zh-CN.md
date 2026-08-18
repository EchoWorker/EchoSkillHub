# EchoSkillHub

[English](README.md) | 简体中文

EchoSkillHub 是一个基于 GitHub 原生能力构建的版本化 Skill 仓库。GitHub
Actions 负责校验和打包，GitHub Releases 保存不可变的 ZIP，GitHub Pages
发布自动生成的 Registry。

## Agent Skills 格式

EchoSkillHub 只接受 Claude Code、claude.ai 上传及 Skills API 都兼容的可移植
Agent Skills frontmatter：

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `name` | 是 | 1–64 个小写字母、数字、连字符；与目录名一致 |
| `description` | 是 | 1–1024 字符；说明做什么以及何时使用 |
| `license` | 否 | 简短许可名称或包内许可文件引用 |
| `compatibility` | 否 | 1–500 字符的环境要求 |
| `metadata` | 否 | 字符串键到字符串值的映射 |
| `allowed-tools` | 否 | 空格分隔的预授权工具；实验性字段 |

`argument-hint`、`disable-model-invocation`、`user-invocable`、`model`、
`context`、`agent` 等 Claude Code 专属字段会被拒绝，因为 claude.ai 和 Skills
API 上传也会拒绝它们。规范来源见
[Agent Skills specification](https://agentskills.io/specification) 和
[Claude Code portability table](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code)。

## 提交新 Skill

1. Fork 本仓库并创建分支。
2. 新建 `skills/<slug>/`。slug 只能包含小写字母、数字和连字符，并且必须与
   `SKILL.md` 中的 `name` 完全一致。
3. 在 Skill 根目录创建唯一的 `SKILL.md`，包含 YAML frontmatter：

   ```yaml
   ---
   name: my-skill
   description: 说明这个 Skill 做什么，以及 Agent 应在什么情况下使用它。
   license: MIT # 可选
   compatibility: 需要 Python 3.12 和网络访问。 # 可选
   metadata: # 可选；键和值都必须是字符串
     author: example-org
     version: "1.0"
     echoskillhub-platforms: windows,macos,linux # 可选的 Hub 检索提示
   allowed-tools: Read Grep # 可选，实验性字段
   ---

   # My Skill

   在这里编写 Skill 指令。
   ```

4. 当可选的 `license` 字段或再分发内容需要许可文件时，在根目录添加
   `LICENSE` 或 `COPYING`。第三方脚本、参考资料或资源必须注明来源，并确认其
   许可允许再分发。
5. 可按需添加 `references/`、`scripts/`、`assets/`、`evals/`。不要提交
   `manifest.json`；发布工作流会自动生成，并放入 Release ZIP。
6. 本地运行完整检查：

   ```powershell
   npm ci
   npm run check
   ```

7. 使用仓库模板创建 Pull Request，说明外部服务、网络访问、凭证需求、脚本及
   第三方内容。
8. 为 PR 添加且只添加一个版本标签。新 Skill 通常选择 `minor`，首次版本为
   `0.1.0`；仅当首次公开契约明确从稳定版开始时选择 `major`，版本为 `1.0.0`；
   选择 `patch` 则版本为 `0.0.1`。

## 更新已有 Skill

1. 只修改对应的 `skills/<slug>/`。保持目录 slug 和 frontmatter `name` 不变；
   改名会被视为另一个 Skill。
2. 同步更新 `SKILL.md`、配套文件以及许可和来源信息。
3. 运行 `npm ci` 和 `npm run check`。
4. 创建 Pull Request，并添加且只添加一个 SemVer 标签：
   - `major`：不兼容的行为或契约变更；
   - `minor`：向后兼容的新功能；
   - `patch`：向后兼容的修复，或内容、文档修订。
5. PR 合并后，工作流会计算新版本、生成 `manifest.json`、创建
   `<slug>-v<version>` tag、上传 `<slug>-<version>.zip`，最后重建公开
   Registry。

一个 PR 如果修改多个 Skill，同一个版本增量会应用到所有这些 Skill。已发布
版本不可覆盖，任何修正都必须发布新版本。不要通过删除目录来下架已发布 Skill；
应联系维护者走经过审核的 deprecated 或 revoked 流程。

## 贡献规则

- Frontmatter 遵循可移植的 Agent Skills 规范。`name` 和 `description` 必填；
  可选字段只有 `license`、`compatibility`、`metadata` 和实验性的
  `allowed-tools`。
- Hub 平台筛选使用字符串字段 `metadata.echoskillhub-platforms`，值为
  `windows`、`macos`、`linux` 的逗号分隔子集。省略表示“未声明”，不代表
  “支持所有平台”。
- 文件路径必须可移植。链接、路径逃逸、大小写冲突、凭证、手工提交的 Manifest
  以及禁止的可执行内容都会被拒绝。
- 被收录、通过审核、扫描或 SHA-256 校验，都不等于安全认证。
- 完整政策及审核要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 分发方式

每个 Skill 拥有独立的 SemVer 发布坐标：

```text
tag:   <slug>-v<version>
asset: <slug>-<version>.zip
```

公开 Registry v1 地址：

```text
https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json
```

## 文档

- [English README](README.md)
- [贡献指南](CONTRIBUTING.md)
- [仓库设计](docs/DESIGN.md)
- [安全策略](SECURITY.md)
- [GitHub 仓库设置清单](docs/REPOSITORY_SETTINGS.md)

分支规则、版本标签、Pages、Environment 等 GitHub 远端设置仍需维护者配置。
