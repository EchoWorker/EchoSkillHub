# 分类与标签契约

> 状态：v1 已实现目标契约

## 源元数据

通用 Agent Skills 规范中的 `metadata` 可选，但发布到 EchoSkillHub 时，必须在该
字符串映射中提供 `category` 和 `tags`：

```yaml
metadata:
  category: developer-tools
  tags: documentation,link-checking,markdown
```

规范 metadata 键仅为 `category` 和 `tags`。

## 分类

每个 Skill 必须且只能选择一个分类。唯一事实源是
`taxonomy/categories.json`，v1 包含以下 13 个受控 slug：

| Slug | 中文名称 |
| --- | --- |
| `automation` | 自动化 |
| `business` | 商业 |
| `communication` | 沟通协作 |
| `data` | 数据 |
| `design` | 设计 |
| `developer-tools` | 开发者工具 |
| `documents` | 文档 |
| `education` | 教育 |
| `infrastructure` | 基础设施 |
| `media` | 媒体 |
| `productivity` | 效率工具 |
| `research` | 研究 |
| `security` | 安全 |

分类是稳定的浏览维度，跨领域概念应使用标签表达。分类弃用和 `replacedBy` 仅是
未来演进方向，不是 v1 已实现字段或行为。

## 标签

`metadata.tags` 必须是无空格的逗号分隔字符串，并满足：

- 1–8 个标签；
- 小写 kebab-case，单个标签长度 1–32；
- 只能包含 ASCII 小写字母、数字和单个连字符；
- 单个 Skill 内唯一，并按字典序升序排列。

标签采用开放词表，不设中央登记文件。它们适合表达具体能力、格式、集成和工作流，
例如 `code-review`、`markdown`、`github`、`release-management`。校验器拒绝而不
静默修正非规范输入，以保持源码和发布包确定性。

## 生成契约

发布流程从已审核的源 metadata 生成强类型一等字段：

```json
{
  "category": "developer-tools",
  "tags": ["documentation", "link-checking", "markdown"]
}
```

`category` 和 `tags` 在生成的 Manifest v1 与 Registry v1 中均为必填字段。
Registry 顶层 Skill 记录同时提供推荐版本 `latest` 和直接下载地址
`downloadUrl`；该地址必须与对应 `versions[].downloadUrl` 完全一致。没有可推荐
版本时，两者均不输出。

修改分类或标签属于 Skill 内容变更，必须产生新的不可变 Release。

## 公共发现资源

GitHub Pages 提供三个稳定 URL：

- <https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json>
- <https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json>

`categories.json` 从 `taxonomy/categories.json` 生成，包含全部 13 个分类，包括
当前 Skill 数量为 0 的分类。`tags.json` 是从 active Skill 派生的发现索引，不是
标签事实源。`registry.json` 是完整 Skill 目录。

三份 JSON 在同一次构建中生成，具有一致的生成时间，并作为同一个 Pages artifact
原子部署，使用方不会观察到新旧文件混用的中间状态。

## 事实源与不变量

| 信息 | 事实源 |
| --- | --- |
| 分类词表 | `taxonomy/categories.json` |
| Skill 分类与标签 | `SKILL.md` 的 `metadata.category`、`metadata.tags` |
| Manifest 分类与标签 | 发布流程从已审核源文件生成 |
| Registry 分类、标签和推荐下载 | 推荐版本 Manifest 与 Release Asset |
| 公共分类、标签索引 | Registry 发布流程生成 |

构建与校验必须保证分类存在于词表、标签数量和排序正确、Manifest 与 Registry
字段一致、顶层 `downloadUrl` 指向 `latest`，并将三份公共 JSON 原子发布。
