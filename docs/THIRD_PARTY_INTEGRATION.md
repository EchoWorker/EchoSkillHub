# 第三方接入指南

<!-- markdownlint-disable MD013 -->

> 适用版本：EchoSkillHub Registry v1  
> 目标读者：接入 EchoSkillHub 的桌面应用、CLI、网站、Agent Host、插件市场及自动化服务开发者

## 1. 接入目标

第三方接入 EchoSkillHub 后，应能够：

1. 拉取稳定的分类列表并渲染分类导航；
2. 拉取完整 Skill 目录；
3. 按分类、标签、关键词、平台和状态筛选 Skill；
4. 获取某个 Skill 的推荐版本和直接下载地址；
5. 下载 ZIP 后校验大小、SHA-256 和包内 Manifest；
6. 安全解压并安装 Skill；
7. 检查更新、切换版本和处理 deprecated/revoked 状态；
8. 在网络失败或 Hub 暂时不可用时使用上一次验证成功的缓存。

EchoSkillHub 是静态 Registry，没有账号、鉴权、动态查询 API 或服务端安装接口。接入方通过 HTTPS 拉取 JSON 和 GitHub Release ZIP，自行完成展示、缓存、安装及生命周期管理。

## 2. 公共资源

### 2.1 Skill Registry

```text
https://echoworker.github.io/EchoSkillHub/registry/v1/registry.json
```

包含所有 Skill 的发现元数据、推荐版本、顶层下载地址和历史版本记录。

### 2.2 分类列表

```text
https://echoworker.github.io/EchoSkillHub/registry/v1/categories.json
```

包含完整分类词表，包括当前 Skill 数量为 0 的分类。使用方应通过该文件渲染分类导航，不能从现有 Skill 反向推断分类全集。

### 2.3 标签列表

```text
https://echoworker.github.io/EchoSkillHub/registry/v1/tags.json
```

包含 active Skill 正在使用的标签及数量，可用于标签筛选、自动补全和热门标签展示。

### 2.4 JSON Schema

```text
https://echoworker.github.io/EchoSkillHub/schemas/registry-v1.schema.json
https://echoworker.github.io/EchoSkillHub/schemas/categories-v1.schema.json
https://echoworker.github.io/EchoSkillHub/schemas/tags-v1.schema.json
https://echoworker.github.io/EchoSkillHub/schemas/skill-manifest.schema.json
```

生产代码必须根据 `schemaVersion` 选择本地固定 Schema。线上 Schema 适合调试、代码生成和人工检查，不建议每次启动时先下载 Schema 再解析 Registry，否则 Schema URL 故障会扩大为整个目录不可用。

## 3. 数据模型

### 3.1 Registry 根对象

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-19T03:55:09.752Z",
  "repository": "https://github.com/EchoWorker/EchoSkillHub",
  "skills": []
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | integer | Registry 契约版本；当前必须为 `1` |
| `generatedAt` | RFC 3339 string | 本次完整目录生成时间 |
| `repository` | HTTPS URL | Registry 所属 GitHub 仓库 |
| `skills` | array | Skill 记录；按 slug 的 ASCII 顺序排列 |

### 3.2 Skill 记录

```json
{
  "slug": "markdown-link-checker",
  "name": "markdown-link-checker",
  "description": "Audits Markdown links...",
  "category": "developer-tools",
  "tags": ["documentation", "link-checking", "markdown"],
  "latest": "0.2.0",
  "downloadUrl": "https://github.com/EchoWorker/EchoSkillHub/releases/download/markdown-link-checker-v0.2.0/markdown-link-checker-0.2.0.zip",
  "status": "active",
  "platforms": ["windows", "macos", "linux"],
  "license": "MIT",
  "compatibility": "Requires Python 3.9 or later.",
  "metadata": {
    "author": "EchoWorker",
    "category": "developer-tools",
    "tags": "documentation,link-checking,markdown"
  },
  "allowedTools": "Read Grep",
  "versions": []
}
```

核心字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `slug` | 是 | Skill 稳定身份；用作本地目录名和索引键 |
| `name` | 是 | 当前与 slug 相同 |
| `description` | 是 | 做什么以及何时使用 |
| `category` | 是 | 分类 slug；必须存在于 `categories.json` |
| `tags` | 是 | 1–8 个规范标签 |
| `status` | 是 | `active`、`deprecated` 或 `revoked` |
| `versions` | 是 | 全部已发布版本，按 SemVer 降序 |
| `latest` | 条件必填 | 推荐版本；完全 revoked 时不存在 |
| `downloadUrl` | 条件必填 | 推荐版本 ZIP 地址；与 `latest` 对应版本完全一致 |
| `platforms` | 否 | 明确声明的平台；省略表示“未声明”，不是“支持全部平台” |
| `license` | 否 | 许可证说明 |
| `compatibility` | 否 | 运行环境要求 |
| `metadata` | 否 | Agent Skills 原始字符串元数据 |
| `allowedTools` | 否 | Agent Skills 实验性预授权工具声明 |
| `statusReason` | 否 | deprecated/revoked 原因 |

接入方应使用顶层 `category`、`tags` 和 `downloadUrl`，不要在正常业务中重新解析 `metadata.category`、`metadata.tags` 或遍历 versions 计算推荐下载地址。metadata 保留用于审计和透传。

### 3.3 版本记录

```json
{
  "version": "0.2.0",
  "publishedAt": "2026-08-19T03:53:42Z",
  "sourceCommit": "418752f197156dc42622e853e803de243c664540",
  "downloadUrl": "https://github.com/EchoWorker/EchoSkillHub/releases/download/markdown-link-checker-v0.2.0/markdown-link-checker-0.2.0.zip",
  "sha256": "086ff8e0889b2fe3ac190d82056bc3d0d1ae7b996c8dd13ed7c949f5ba96ee58",
  "size": 2412,
  "status": "active"
}
```

`sourceCommit`、`downloadUrl`、`sha256` 和 `size` 共同定义不可变发布事实。同一个 `slug + version` 不允许指向不同字节。

### 3.4 分类记录

```json
{
  "slug": "developer-tools",
  "name": "Developer Tools",
  "nameZhCN": "开发者工具",
  "description": "Coding, testing, review, repositories, and documentation tooling.",
  "order": 60,
  "skillCount": 1
}
```

- 使用 `slug` 作为身份和筛选值；
- 使用 `name` 或 `nameZhCN` 展示；
- 按 `order` 排列，不能自行按本地化名称排序；
- `skillCount` 只统计 active Skill；
- 分类即使没有 Skill 也会出现。

### 3.5 标签记录

```json
{
  "slug": "markdown",
  "skillCount": 1
}
```

标签只来自 active Skill，按 Skill 数量降序、slug 升序排列。使用方不应假设标签永远存在；当最后一个 active Skill 不再使用某标签时，该标签会从 `tags.json` 消失。

## 4. 推荐读取流程

### 4.1 首次启动

```text
并行请求 categories.json、tags.json、registry.json
        │
        ├─ 校验 HTTP 200、Content-Type/UTF-8、大小上限
        ├─ 解析 JSON
        ├─ 校验 schemaVersion
        ├─ 校验三者 generatedAt 完全一致
        ├─ 使用内置 Schema 校验结构
        ├─ 建立内存索引
        └─ 原子替换本地“最后一次已验证快照”
```

必须先完整验证三份文件，再整体替换缓存。不能先保存新 Registry、后保存旧分类列表，否则进程崩溃时会留下不一致快照。

### 4.2 后续刷新

建议：

1. 每次用户打开市场页面时后台刷新；
2. 或设置 15–60 分钟刷新间隔；
3. 使用 HTTP `If-None-Match` / `If-Modified-Since`；
4. 收到 `304 Not Modified` 时继续使用本地快照；
5. 任一文件拉取或校验失败时保留旧快照；
6. 不要把临时网络失败解释为“所有 Skill 已下架”。

三份 JSON 的 `generatedAt` 必须一致。不一致说明读取跨越了 Pages 部署边界，应短暂等待并重新请求全部文件，而不是混用。

### 4.3 本地索引

建议建立：

```text
skillsBySlug: Map<string, Skill>
skillsByCategory: Map<string, Skill[]>
skillsByTag: Map<string, Skill[]>
categoriesBySlug: Map<string, Category>
versionsBySkill: Map<string, Map<SemVer, Version>>
```

索引只从通过 Schema 和语义检查的完整快照构建。

## 5. 展示与检索

### 5.1 分类导航

1. 按 `categories[].order` 渲染全部分类；
2. 可显示 `skillCount`；
3. 默认隐藏或置灰 `skillCount = 0`，但不要删除其本地定义；
4. 用户选择分类后过滤 `skill.category === category.slug`；
5. 未识别的分类 slug 显示为“未知分类”，不能自动归到其他分类。

### 5.2 标签筛选

建议采用 AND 或 OR 之一并在 UI 中明确：

- AND：Skill 必须包含所有选中标签；
- OR：Skill 包含任一选中标签。

标签字符串已经规范化为小写 kebab-case，可直接进行精确比较，不需要再次 lowercase、分词或模糊归并。

### 5.3 文本搜索

最小实现可以搜索：

1. `name` / `slug`；
2. `description`；
3. `tags`；
4. category 的中英文展示名称。

建议权重：名称 > tags > description > 分类展示名。不能通过标签数量提高排名，避免鼓励关键词堆砌。

### 5.4 平台过滤

- 存在 `platforms`：只在匹配平台中展示为“明确支持”；
- 不存在 `platforms`：显示“平台未声明”；
- 不得将省略解释为支持 Windows、macOS 和 Linux。

## 6. 下载与完整性验证

### 6.1 推荐版本下载

正常安装直接使用：

```text
skill.downloadUrl
```

同时找到：

```text
skill.versions.find(v => v.version === skill.latest)
```

下载前必须确认：

```text
skill.downloadUrl === latestVersion.downloadUrl
```

虽然 Hub 已保证该不变量，接入方再次检查可以阻止缓存损坏、代理篡改或错误实现。

### 6.2 下载过程

推荐流程：

1. 下载到临时文件，不直接覆盖当前安装；
2. 限制重定向次数和最大下载字节数；
3. 要求最终协议仍为 HTTPS；
4. 实际字节数必须等于 `version.size`；
5. 计算 ZIP 原始字节 SHA-256；
6. 必须等于 `version.sha256`；
7. 校验成功后再解析 ZIP；
8. 失败时删除临时文件并保留当前版本。

伪代码：

```text
bytes = download(skill.downloadUrl, maxBytes = version.size)
assert bytes.length == version.size
assert sha256(bytes) == version.sha256
```

不要只依赖 GitHub 的 ETag、Content-Length 或 Release digest；Registry SHA-256 才是接入契约中的完整性值。

## 7. ZIP 与 Manifest 校验

### 7.1 ZIP 安全门禁

解压前逐个检查 entry：

- 禁止绝对路径；
- 禁止 `..` 路径逃逸；
- 禁止反斜杠绕过和盘符路径；
- 禁止符号链接、硬链接和设备文件；
- 拒绝大小写不敏感冲突；
- 限制文件数量、单文件大小和解压总大小；
- 解压目标必须位于临时目录；
- 不自动执行任何脚本或二进制。

即使 Hub 发布端已检查，安装端仍必须把 ZIP 视为不可信网络输入。

### 7.2 包结构

ZIP 根目录直接包含：

```text
SKILL.md
manifest.json
LICENSE                 # 可选
references/             # 可选
scripts/                # 可选
assets/                 # 可选
evals/                  # 可选
```

没有额外 `<slug>-<version>/` 包装目录。

### 7.3 Manifest 验证

读取根级 `manifest.json` 后：

1. 按 `schemaVersion` 选择内置 Manifest Schema；
2. 校验 Schema；
3. 校验 `manifest.slug === skill.slug`；
4. 校验 `manifest.version === skill.latest` 或用户指定版本；
5. 校验 `manifest.name === skill.name`；
6. 校验 `manifest.category === skill.category`；
7. 校验 `manifest.tags` 与 Skill 顶层 tags 完全一致；
8. 校验 `manifest.metadata.category === manifest.category`；
9. 校验 `manifest.metadata.tags === manifest.tags.join(',')`。

只有全部通过才允许进入安装提交阶段。

## 8. 原子安装建议

推荐目录：

```text
<root>/skills/<slug>/current.json
<root>/skills/<slug>/versions/<version>/...
```

安装流程：

```text
下载临时 ZIP
→ 校验 size/SHA-256
→ 安全解压到临时目录
→ 校验 Manifest
→ 将临时目录原子重命名为 versions/<version>
→ 原子更新 current.json
→ 延迟清理旧版本
```

`current.json` 示例：

```json
{
  "slug": "markdown-link-checker",
  "version": "0.2.0",
  "sha256": "086ff8e0889b2fe3ac190d82056bc3d0d1ae7b996c8dd13ed7c949f5ba96ee58",
  "installedAt": "2026-08-19T04:00:00Z"
}
```

不要把“下载”“解压”和“切换当前版本”合并为一个不可恢复步骤。进程中断时，旧版本必须继续可用。

## 9. 更新、回滚与卸载

### 9.1 检查更新

比较已安装版本和 `skill.latest`：

- 相等：无需更新；
- latest 更高：提示更新；
- latest 更低：说明 Hub 因治理原因回退了推荐版本，应提示“建议回退”，不能简单认为本地版本更新；
- latest 不存在：Skill 已完全 revoked，不再提供推荐下载。

SemVer 比较必须使用标准库，不能按字符串排序。

### 9.2 历史版本安装

如产品允许安装历史版本，应从 `versions[]` 选择，并明确显示状态：

- `active`：正常版本；
- `deprecated`：可安装但不推荐；
- `revoked`：默认禁止安装。

不要根据文件名自行拼接下载 URL，必须使用对应 `version.downloadUrl`。

### 9.3 回滚

更新前保留旧版本目录。新版本运行失败时，仅原子切换 `current.json` 指针，无需重新下载。

### 9.4 卸载

卸载应删除本地安装和运行时授权，但不影响 Registry 缓存。若 Skill 保存用户数据，必须区分“卸载程序”和“删除用户数据”。

## 10. 状态处理

### 10.1 active

正常展示、安装和更新。

### 10.2 deprecated

- 保留展示和历史版本；
- 显示 `statusReason`；
- 新安装前提示；
- 不应自动卸载已安装版本。

### 10.3 revoked

完全 revoked 的 Skill：

- 没有 `latest`；
- 没有顶层 `downloadUrl`；
- 历史 versions 仍用于审计；
- 默认禁止新安装和自动更新；
- 已安装实例应显示高优先级风险提示，由产品安全策略决定禁用还是允许用户确认后继续使用。

接入方不能通过选择 versions 中最新的版本来绕过 revoked 状态。

## 11. 缓存与离线策略

推荐保存：

```text
catalog/current/registry.json
catalog/current/categories.json
catalog/current/tags.json
catalog/current/meta.json
catalog/staging/...
```

`meta.json` 可记录：

```json
{
  "generatedAt": "2026-08-19T03:55:09.752Z",
  "etag": {
    "registry": "...",
    "categories": "...",
    "tags": "..."
  },
  "validatedAt": "2026-08-19T04:00:00Z"
}
```

离线时：

- 有已验证快照：继续展示，并标记最后更新时间；
- 没有快照：显示“目录暂不可用”；
- 已下载且验证过的安装包可以继续安装；
- 不能用未完成校验的 staging 文件替代 current。

## 12. 错误处理

| 场景 | 建议行为 |
| --- | --- |
| HTTP 超时/5xx | 指数退避，继续使用旧快照 |
| 404 | 短暂重试；持续 404 时报告目录不可用 |
| 429 | 尊重 `Retry-After`，不密集重试 |
| JSON 解析失败 | 拒绝新快照，保留旧快照 |
| 未知 schemaVersion | 保留旧快照，提示客户端升级 |
| 三份 generatedAt 不一致 | 丢弃本轮结果并整体重试 |
| category 不存在 | 拒绝新 Registry 快照 |
| downloadUrl 与 latest 不一致 | 拒绝对应 Skill 或整个新快照，建议失败关闭 |
| ZIP size/SHA 不一致 | 删除临时包，禁止安装 |
| Manifest 与 Registry 不一致 | 禁止安装并上报完整性错误 |
| revoked | 禁止新安装，提示安全状态 |

目录刷新应失败关闭，但不能破坏最后一次已验证快照。

## 13. 安全边界

Registry 收录、PR 审核、静态扫描和 SHA-256 都不等于安全认证。第三方仍应：

- 把 Skill 指令和资源视为不可信内容；
- 在实际执行网络、文件写入、进程、邮件、消息等高影响动作前应用自己的授权机制；
- 不因 `allowedTools` 存在就自动授予权限；
- 对脚本运行使用沙箱、最小权限和用户确认；
- 记录 Skill slug、版本、摘要和来源，便于审计；
- 定期刷新 revoked 状态。

`allowedTools` 是实验性声明，不是由 EchoSkillHub 授予的权限票据。

## 14. 第三方来源审计

EchoSkillHub 收录第三方 Skill 时固定上游 commit，而不是跟踪分支。每个第三方包都必须
包含上游许可证、根级 `NOTICE` 和严格的 `PROVENANCE.json`，记录来源、commit、tree/blob
标识、文件 SHA-256 和本地适配。`node scripts/audit-third-party-skill.mjs skills/<slug>`
只对字节进行被动分析，不执行被审计脚本；它提供 intake evidence，不代表安全认证或权限
授予。脚本、`allowed-tools`、网络、凭据、部署和费用操作仍必须由接入方按最小权限和用户
确认处理。

## 15. TypeScript 接入示例

```ts
type Category = {
  slug: string;
  name: string;
  nameZhCN: string;
  description: string;
  order: number;
  skillCount: number;
};

type SkillVersion = {
  version: string;
  publishedAt: string;
  sourceCommit: string;
  downloadUrl: string;
  sha256: string;
  size: number;
  status: "active" | "deprecated" | "revoked";
};

type Skill = {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  status: "active" | "deprecated" | "revoked";
  statusReason?: string;
  latest?: string;
  downloadUrl?: string;
  platforms?: Array<"windows" | "macos" | "linux">;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string;
  versions: SkillVersion[];
};

type Registry = {
  schemaVersion: 1;
  generatedAt: string;
  repository: string;
  skills: Skill[];
};
```

最小加载逻辑：

```ts
const BASE = "https://echoworker.github.io/EchoSkillHub/registry/v1";

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(`${BASE}/${name}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadCatalog() {
  const [registry, categories, tags] = await Promise.all([
    fetchJson<Registry>("registry.json"),
    fetchJson<{ schemaVersion: 1; generatedAt: string; categories: Category[] }>("categories.json"),
    fetchJson<{ schemaVersion: 1; generatedAt: string; tags: Array<{ slug: string; skillCount: number }> }>("tags.json"),
  ]);

  if (
    registry.schemaVersion !== 1 ||
    categories.schemaVersion !== 1 ||
    tags.schemaVersion !== 1
  ) throw new Error("unsupported schema version");

  if (
    registry.generatedAt !== categories.generatedAt ||
    registry.generatedAt !== tags.generatedAt
  ) throw new Error("catalog snapshot is inconsistent; retry all files");

  return { registry, categories, tags };
}
```

生产实现还必须加上 Schema 校验、缓存原子替换、超时、重试、大小限制和完整性验证，不能直接照搬最小示例作为完整安全实现。

## 16. CLI 接入示例

目录查看：

```powershell
$base = "https://echoworker.github.io/EchoSkillHub/registry/v1"
$registry = Invoke-RestMethod "$base/registry.json"
$categories = Invoke-RestMethod "$base/categories.json"
$tags = Invoke-RestMethod "$base/tags.json"

$categories.categories | Sort-Object order | Format-Table slug, nameZhCN, skillCount
$registry.skills | Where-Object category -eq "developer-tools"
```

下载推荐版本：

```powershell
$skill = $registry.skills | Where-Object slug -eq "markdown-link-checker"
$version = $skill.versions | Where-Object version -eq $skill.latest
Invoke-WebRequest $skill.downloadUrl -OutFile "$env:TEMP\$($skill.slug)-$($skill.latest).zip"
$hash = (Get-FileHash "$env:TEMP\$($skill.slug)-$($skill.latest).zip" -Algorithm SHA256).Hash.ToLower()
if ($hash -ne $version.sha256) { throw "SHA-256 mismatch" }
```

## 17. 接入测试清单

### 16.1 正常流程

- 能加载三份 JSON；
- 能按 order 渲染 13 个分类；
- 能看到零 Skill 分类；
- 能按 developer-tools 找到 markdown-link-checker；
- 能按任一标签筛选；
- 能通过顶层 downloadUrl 下载 0.2.0；
- ZIP size、SHA-256 和 Manifest 均验证通过；
- 能原子安装并记录版本与摘要。

### 16.2 变异测试

构造并确认拒绝：

- Registry 未知 schemaVersion；
- 三份 generatedAt 不一致；
- 重复 Skill slug；
- category 不存在；
- tags 超限或重复；
- latest 不存在于 versions；
- latest 指向 revoked；
- 顶层 downloadUrl 与 latest 版本不一致；
- ZIP 少一个字节或 SHA 被修改；
- ZIP 包含 `../`、绝对路径或大小写冲突；
- Manifest slug/version/category/tags 与 Registry 不一致；
- revoked Skill 仍带顶层 downloadUrl。

### 16.3 恢复测试

- 新目录请求超时后仍使用旧快照；
- 写 staging 中断不破坏 current；
- 更新安装中断仍可运行旧版本；
- Hub 推荐版本回退时能提示并切回旧版本；
- Pages 短暂返回跨版本文件时能整体重试。

## 18. 兼容与版本演进

接入方必须把 `schemaVersion` 当作协议版本，而不是忽略字段：

- `schemaVersion = 1`：按本指南解析；
- 未识别版本：不要猜测字段语义，应继续使用本地最后一次支持的快照并提示升级；
- 同一 v1 内不要依赖未在 Schema 中声明的字段；
- 对可选字段使用缺省处理；
- 对必填字段缺失失败关闭。

URL 中包含 `/v1/`，未来不兼容变更会发布新版本路径，而不是静默改变旧路径语义。

## 19. 最小接入验收标准

一个第三方实现至少满足以下条件才算完成：

- 使用三个正式 HTTPS JSON 地址；
- 校验 schemaVersion 和三份 generatedAt；
- 使用 category slug 和 tags 进行发现；
- 使用顶层 downloadUrl 获取推荐版本；
- 使用 versions 中对应记录验证 size 和 SHA-256；
- 安全解压并验证 Manifest；
- 原子安装，不破坏已有版本；
- 正确处理 active、deprecated、revoked；
- 网络或新快照失败时保留最后一次已验证状态；
- 不把 Registry 收录或 allowedTools 当作权限授权和安全认证。
