# GitHub Daily — 设计稿

**Status**: Draft
**Date**: 2026-05-06
**Authors**: Autumn

---

## 1. 摘要

GitHub Daily 是一个**自部署、AI 增强、个性化**的 GitHub 项目发现工具。

用户 **fork 仓库 → 改一份 YAML 配置 → GitHub Actions 定期运行**，每次跑完会：

- 把发现的项目精排为一份**双语**摘要 issue
- 部署一份**优雅杂志风**的静态站到 GitHub Pages
- 可选推送到 Telegram / 邮件 / RSS

定位是 GitHub 上"会传播的开源工具"——零部署成本、5 分钟跑通、每个用户的发现页都不一样。

## 2. 目标与优先级

| 优先级 | 目标 | 验收 |
|---|---|---|
| 主 | **开源推广** | 上线 3 个月内 GitHub ≥ 100 star（数字 placeholder，可调） |
| 次 | **自己用** | 连续用 7 天，"推荐里 ≥ 30% 是会主动想点开看且没看过的" |
| 约束 | **可用性** | 新用户从 fork 到看到自己第一份发现页 ≤ 10 分钟 |

冲突时：推广 > 自用。具体表现为：个性化深度浅一些（依赖 YAML 配置而非纯 starred 行为）；视觉投入必须到位；中英双语并重。

## 3. 范围

**做**：
- 真 GitHub trending discovery（不是预设列表跟踪）
- 多源聚合（GitHub Trending / Search / HN / events）
- 跨源去重 + 历史去重
- 基于 starred 的兴趣画像 + YAML 显式偏好
- LLM 双语摘要（50–80 字 / 项目）
- 静态站（Astro，杂志风）
- 多端推送（Pages / Telegram / Email / RSS）

**不做（YAGNI）**：
- 用户系统、登录、收藏、评论
- 服务端、数据库、付费
- 移动 App、浏览器扩展
- "项目质量评分"等主观维度
- 跨用户聚合或社交（每个 fork 都是独立的）

## 4. 差异化定位

调研已确认 [duanyytop/agents-radar](https://github.com/duanyytop/agents-radar) (~720★) 接近本设计的"框架形态"，[Thysrael/Horizon](https://github.com/Thysrael/Horizon) (~2.3k★) 工程更扎实但**不抓 trending**，HelloGitHub / GitHubDaily 是人工运营且不允许 fork 衍生。

我们的差异化锚定四点：

1. **真 trending discovery** — 主动从 trending / HN / awesome 这些动态源里发现新东西，不是预设 repo 列表
2. **基于用户的个性化** — LLM 读 starred 推断兴趣画像，再过滤排序
3. **跨源去重** — 同一项目在多个源出现时合并，并把"在 N 个源出现"作为排序信号 + UI 标签
4. **中文一等公民 + 英文一等公民** — 双语并重

## 5. 系统架构

### 流程

```
                  cron / manual_dispatch
                          │
                          ▼
            ┌─────────────────────────────┐
            │       GitHub Actions        │
            │                             │
            │  1. fetch (4 sources)       │
            │  2. dedup (cross + history) │
            │  3. profile (load/build)    │
            │  4. rank   (LLM)            │
            │  5. summarize (LLM)         │
            │  6. render (Astro build)    │
            └─────────────┬───────────────┘
                          │
            ┌─────────────┼──────────────────┐
            │             │                  │
            ▼             ▼                  ▼
     git commit      Pages deploy     optional push
     (history)      (yourname.github.   (telegram / 
                     io/githubdaily)     email / rss)
```

### 项目结构

```
githubdaily/
├─ .github/workflows/
│   └─ daily.yml              # cron + workflow_dispatch
├─ config/
│   ├─ config.yaml            # 用户主配置
│   └─ profile.yaml           # LLM 生成、用户可编辑的兴趣画像
├─ src/
│   ├─ fetchers/              # trending / search / hn / events
│   │   ├─ trending.ts
│   │   ├─ search.ts
│   │   ├─ hn.ts
│   │   └─ events.ts
│   ├─ pipeline/
│   │   ├─ dedup.ts
│   │   ├─ profile.ts         # 画像生成 / 加载
│   │   ├─ rank.ts
│   │   └─ summarize.ts
│   ├─ llm/
│   │   └─ openai-compatible.ts
│   ├─ render/
│   │   ├─ build-issue.ts     # 组装 IssueData
│   │   └─ push.ts            # telegram/email/rss
│   └─ index.ts               # 入口
├─ web/                       # Astro 项目
│   ├─ src/
│   │   ├─ pages/
│   │   │   ├─ index.astro    # 最新一期
│   │   │   └─ archive/[slug].astro  # 历史归档
│   │   ├─ components/
│   │   │   ├─ Header.astro
│   │   │   ├─ Hero.astro
│   │   │   └─ Item.astro
│   │   └─ styles/global.css  # 杂志风
│   └─ astro.config.ts
├─ data/                      # git-tracked 状态
│   ├─ issues/
│   │   └─ 2026-W18.json      # 每期快照
│   └─ seen.json              # 历史已推 repo 集合
├─ tests/
│   ├─ fixtures/              # recorded HTTP responses
│   └─ ...
├─ README.md                  # 中文
├─ README_EN.md               # 英文
└─ package.json
```

**技术栈选择**：TypeScript + Node.js 单一栈（fetcher / pipeline / Astro 共享类型），避免 Python+JS 混栈。

## 6. Pipeline (5 阶段)

| # | 阶段 | 输入 | 输出 | 关键逻辑 |
|---|---|---|---|---|
| 1 | **fetch** | config | 候选 ~200 项 | 4 个 fetcher 并发；单源失败 warn + 跳过；≥ 2 个源成功才继续 |
| 2 | **dedup** | 候选 + `seen.json` | ~150 项 | 按 `owner/repo` 跨源合并；保留 `sources: [...]` 元信息；过滤掉过去 N **期** issues 里已推过的（默认 N=4） |
| 3 | **profile** | starred + `profile.yaml` | profile 对象 | 触发生成的条件见 §9；否则直接读 yaml |
| 4 | **rank** | 候选 + profile | top N + reasons | 一次 LLM 调用比对画像和候选；产 score(0-100) + reason(为什么推) |
| 5 | **summarize** | top N | 带摘要的 N 项 | 单条 LLM 调用产双语 50–80 字段落；并发限流（默认 3） |

**fetch 失败容忍**：单 fetcher 失败 warn + 跳过；活下来的 fetcher 数 < 2 则 abort 整次（避免发布残缺 issue）。

## 7. 数据源细节

| 源 | 取数方式 | 配置 | 备注 |
|---|---|---|---|
| **GitHub Trending** | 爬 `github.com/trending`（无官方 API），按 `langs` 过滤 | `langs: [rust, python, ...]`、`window: daily/weekly` | 失败可重试，HTML 结构稳定但要监控 |
| **GitHub Search** | REST `/search/repositories?q=...&sort=stars&order=desc` | `queries: ["topic:llm stars:>100 created:>{-30d}"]` | 用户可写多个 query，关键差异化点（找小众优质） |
| **Hacker News** | `hn.algolia.com/api` 搜含 `github.com` 的高分帖 | `min_score: 100` | 抽取链接的 `owner/repo`，再去 GitHub API 拉 metadata |
| **GitHub Events**（可选） | `/users/{user}/following` → `/users/{u}/events` 过滤 `WatchEvent` | `enabled: false` 默认；启用需 `GH_TOKEN` secret | 强差异化点：「你 follow 的 X 给这个 star 了」 |

每个 fetcher 输出统一形态：
```ts
type Candidate = {
  owner: string; repo: string;
  description: string;
  stars: number; stars_delta?: number;
  language?: string;
  topics?: string[];
  url: string;
  source: "trending" | "search" | "hn" | "events";
  source_meta?: Record<string, unknown>;  // hn_score, follower_who_starred, ...
}
```

## 8. LLM 适配

**单 adapter，OpenAI 兼容协议**。覆盖 OpenAI / DeepSeek / Moonshot / Qwen / 智谱 / Ollama / Groq / xAI 以及各种 OpenAI 兼容代理。

```ts
// src/llm/openai-compatible.ts
export async function chat(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseFormat?: "json" | "text";
}): Promise<string>
```

配置：
```yaml
llm:
  base_url: https://api.deepseek.com  # 或 https://api.openai.com/v1, http://localhost:11434/v1 等
  model: deepseek-chat
  # api_key 从 secrets.LLM_API_KEY 注入
```

文档示例 5–6 家典型配置（OpenAI / DeepSeek / Moonshot / Qwen / Ollama / Groq）。

## 9. 个性化机制（方案 A：画像 + 规则）

### 画像生成触发条件

按以下顺序判定，命中即生成：

1. 仓库里**没有** `config/profile.yaml` → 生成
2. `config.profile.regenerate: true` → 生成（生成后脚本把该 flag 改回 false 一并 commit）
3. 否则跳过生成，直接 load 现有 yaml

生成步骤：

1. Action 拉 `github_username` 最近 100 个 starred repo（owner/repo + description）
2. 一次 LLM 调用 → 输出 `profile.yaml`（带 `# generated YYYY-MM-DD` 注释）
3. commit 回仓库（和 issue 一起在 pipeline 末尾的 commit 里）

`profile.yaml` 结构：
```yaml
# generated 2026-05-06; edit freely
themes:
  - "LLM 工具链与推理引擎"
  - "终端 TUI 与开发者工具"
  - "Rust 系统编程"
languages: [rust, python, go]
exclude_themes:
  - "区块链 / Web3"
  - "营销/SEO 工具"
notes: |
  偏好底层、性能敏感、开发者工具方向。
  对 SaaS、营销类项目不感兴趣。
```

### 排序时使用

LLM 一次性输入：`profile.yaml` + 候选项目列表（每个: owner/repo + description + topics + sources）→ 输出每个项目的 `score(0-100) + reason(中文一句话)`。

reason 会展示在站点上（"为什么推它"），强可解释性。

### 用户编辑

profile.yaml 完全可手编。下次跑直接读手编结果。如果用户想用一个全新的 starred 推断（比如 starred 偏好变了），把 `config.profile.regenerate` 改 true，下次跑会重新生成、用完后自动改回 false。

## 10. 用户接触点：`config.yaml`

```yaml
# 必填
schedule: weekly                # weekly | daily | "0 9 * * 1" (cron 表达式)
languages: [zh, en]             # 输出语言
github_username: yourname

# 个性化
profile:
  regenerate: false             # true 时下次重新基于 starred 生成

# LLM (key 在 GitHub Secrets: LLM_API_KEY)
llm:
  base_url: https://api.deepseek.com
  model: deepseek-chat

# 数据源开关
sources:
  trending:
    enabled: true
    langs: [rust, python, typescript, go]
    window: weekly
  search:
    enabled: true
    queries:
      - "topic:llm stars:>100 created:>{-30d}"
      - "topic:cli language:rust pushed:>{-7d}"
  hn:
    enabled: true
    min_score: 100
  events:
    enabled: false              # 启用需 GH_TOKEN secret

# 输出
outputs:
  pages:    { enabled: true }
  rss:      { enabled: true }
  telegram: { enabled: false, chat_id: "" }   # token 在 secrets
  email:    { enabled: false, to: "" }        # smtp 在 secrets

# 数量
top_n: 5                        # 总展示数
hero_n: 1                       # hero 区数
history_window: 4               # 过去 N 期 issue 里出现过的不再推（与 schedule 单位无关，按"期"算）
```

## 11. 视觉规范（杂志风 v3）

- **颜色**
  - 底色 `#FAFAF7`（米白，不是冷白）
  - 主文字 `#1A1A1A`（深炭，不纯黑）
  - 次文字 `#555` / `#888` / `#999`
  - Accent `#B45309`（赭红，仅用于 tag、编号）
  - Up `#047857`（深绿，仅 stars 增量）
- **字体**
  - 衬线（标题/编号）：`Iowan Old Style, Palatino Linotype, Georgia, serif`
  - 无衬线（正文）：`-apple-system, Inter, "Segoe UI", system-ui`
  - 等宽（元数据）：`ui-monospace, "SF Mono", "JetBrains Mono"`
- **字号比例**（基础 16px）
  - Hero title 3.6rem
  - Hero sub 1.3rem (italic serif)
  - Hero body 1.05rem
  - Item title 1.3rem
  - Item summary 1.0rem
  - Item meta 0.8rem (mono)
- **布局**：max-width 800px，padding 2.75rem 3.25rem
- 详细规范在最终 mockup `elegant-v3.html`

## 12. 错误处理 & 降级（"不要兜底但要韧性"）

| 失败场景 | 处理 |
|---|---|
| 单个 fetcher 失败 | warn + 跳过 |
| 活下来的 fetcher 数 < 2 | abort，不发布残缺 issue |
| LLM 单条 summarize 失败 | 重试 1 次；仍失败则 abort 整次（不静默用 description 兜底） |
| LLM rank 失败 | 重试 1 次；仍失败 abort（rank 是必经步骤） |
| 候选 0 项（dedup 后） | abort，不发空 issue |
| repo metadata 缺失 | 该项跳过，继续 |
| Pages 部署失败 | 整次 Action 标记失败，但 `data/` commit 已完成（下次跑能续上历史） |

错误日志输出到 `actions` summary，关键错误以 GitHub Issue 形式开（不依赖用户去翻 Actions log）。

## 13. 状态管理

**纯 git 作为状态存储，无外部数据库**。

- `data/issues/2026-W18.json` — 每期完整快照（候选、排序、摘要、reasons），可用于历史归档站点和 debug
- `data/seen.json` — `{ "owner/repo": "issue_slug" }`，用于跨期去重
- 每次 Action 跑完最后一步：`git commit data/* config/profile.yaml -m "issue: 2026-W18"` 推回仓库

## 14. 测试策略

| 层 | 内容 | 工具 |
|---|---|---|
| **fixture-driven 单元** | 每个 fetcher 用 recorded HTTP fixture 测一遍解析 | `nock` / 手写 fixture |
| **端到端** | mock LLM + 完整 fixture pipeline → 断言输出 IssueData 包含特定项目 + HTML 含特定字符串 | Vitest + Astro test |
| **smoke (CI)** | 每周触发 dry-run（不发布、不推送、不 commit），确保抓取链路活着 | GitHub Actions |
| **手测** | 本地 `npm run dev` 跑一次完整流程 | — |

## 15. 部署 & CI

`daily.yml` 关键步骤：

```yaml
on:
  schedule: [{ cron: "0 9 * * 1" }]   # 默认每周一 09:00 UTC，用户改 config 后由脚本同步生成
  workflow_dispatch:                  # 手动触发

permissions:
  contents: write    # commit data/
  pages: write       # deploy
  id-token: write

jobs:
  daily:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node 20
      - npm ci
      - run: npm run pipeline
        env:
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          GH_TOKEN:    ${{ secrets.GH_TOKEN }}    # events 数据源可选
      - run: cd web && npm run build
      - upload-pages-artifact: ./web/dist
      - deploy-pages
      - run: git push  # commit data/ 已在 pipeline 里完成
```

**重要**：cron 表达式由 `config.schedule` 决定，但 `daily.yml` 里要硬编码——所以提供一个 `npm run sync-cron` 脚本，读 config 改 workflow，用户改 schedule 后跑一次即可。

## 16. README 与推广

**README 结构**（中英两份并列）：

1. **顶部**：一张 demo GIF（30 秒滚一期完整 issue），下方一行字 + GitHub Pages demo 链接
2. **5 分钟开始**：fork → 改 config 4 行 → 设两个 secret → 跑一次 workflow → 看自己的页面（带截图）
3. **它会发现什么**：示例 issue 截图 + 数据源说明
4. **配置参考**：完整 config.yaml 注释 + LLM provider 兼容表（OpenAI / DeepSeek / Moonshot / Qwen / Ollama / Groq 各一份示例）
5. **设计文档链接**（指向本文件）

推广素材：
- demo 站（你自己的 fork） — README 顶部链接
- 多张截图：桌面 / 移动 / RSS 客户端中
- demo GIF（关键，传播力来源）

## 17. 验收标准

| # | 标准 | 测量方式 |
|---|---|---|
| 1 | **推广**：上线 3 个月内 ≥ 100 GitHub stars | github.com 直观 |
| 2 | **自用**：连续 7 期摘要后，"≥30% 是会主动想点开看且没看过的" | 手动主观评估 |
| 3 | **门槛**：新用户从 fork 到第一份页面 ≤ 10 分钟 | 找朋友实测计时 |
| 4 | **稳定性**：连续 4 周不漏发（除非用户改坏 config） | 看 Actions 历史 |

## 18. 风险 & 未决

- **GitHub Trending HTML 结构变更** — 没有官方 API。监控：fixture 测试 + smoke run。备选：fallback 到 search API
- **LLM 成本不可控** — 用户用商业 model 时，每期约 5–10 次 LLM 调用。文档里给出 token 估算
- **推广目标的星数门槛** — 100 是 placeholder。如果推广反馈差，需要复盘是产品形态问题还是 README/demo 问题
- **events 数据源的 token 权限** — `GH_TOKEN` 默认只读 public，但抓 follow events 需要 `read:user`。文档里写明
- **未做**：移动端响应式（杂志风在小屏阅读体验需另行验证）

## 19. 实现顺序建议

里程碑式，每个里程碑独立可见 demo：

| Milestone | 内容 | demo |
|---|---|---|
| **M1 · scaffold** | 项目结构、单 fetcher (trending)、最小 pipeline、最简单 HTML 输出 | 本地命令行能产出一份 issue |
| **M2 · LLM** | 加 LLM 摘要 + rank；profile 生成（先用静态 yaml，跳过自动生成） | 一份带摘要 + 排序的 issue |
| **M3 · Astro 站** | Astro 项目、杂志风样式、index + archive | 本地静态站可看 |
| **M4 · 多源 + 去重** | search / hn / events fetcher；跨源去重 + 历史去重 | 候选池扩大、source 标签上 |
| **M5 · GitHub Actions** | workflow、secrets、自动 commit、deploy-pages | fork 后能跑通 |
| **M6 · profile 自动生成** | 拉 starred + LLM 画像生成 + commit | 个性化生效 |
| **M7 · 推送渠道** | telegram / email / rss | 多端通知 |
| **M8 · README + demo** | 双语 README、demo GIF、多语言示例配置 | 可推广 |

每个里程碑 ≤ 1 份 PR 大小，便于 implementation plan 切片。

---

## 附：决策记录

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 静态站生成器 | **Astro** | Next static / Vite / 11ty | 内容站点最优、HTML 极小、构建快 |
| 技术栈 | **TS + Node** | Python + JS 混栈 | 单一栈、共享类型 |
| LLM 适配 | **仅 OpenAI 兼容协议** | + Anthropic 原生 | 单 adapter 已覆盖主流；Anthropic 用户可走代理 |
| 个性化 | **方案 A: 画像 + 规则** | B 双向量 / C 纯 LLM 单步 | 可解释、零外部依赖、README 友好 |
| 状态存储 | **纯 git** | DB / KV / object storage | 零运维、零成本、可 fork |
| 摘要格式 | **1 段 50–80 字双语** | 多段 / bullet / 单语 | 节奏稳定、阅读流畅 |
| 视觉 | **杂志风 v3** | 现代卡片 / hacker / 终端 | "效果服务、优雅美观" |
| 频率默认 | **每周** | 每日 | 信息密度刚好；用户可改 |
