# Octozine · GitHub 项目周刊

[中文](./README.md) · [English](./README_EN.md)

> **A folio of GitHub, curated weekly.**
> 自部署、AI 增强、个性化的 GitHub 项目发现工具。Fork 它,然后每周一份只为你定制的 GitHub 项目周刊。

[![demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://autumn1337.github.io/octozine/)
[![tests](https://img.shields.io/badge/tests-79%20passing-brightgreen?style=flat-square)](https://github.com/Autumn1337/octozine/actions)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

![hero](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png)

---

## 它是什么

每周一,Octozine 在你 fork 的仓库里跑一遍 GitHub Actions:

1. 从 **GitHub Trending / Search API / Hacker News** 抓 ~150 个候选项目
2. 用你设的 LLM 按你的兴趣画像精排,选出 top 5
3. 给每个项目生成中英双语摘要 + 一句中文"为什么推它"
4. 部署成一份杂志风的 GitHub Pages 站(就是你看到的 [demo](https://autumn1337.github.io/octozine/))
5. 可选: 推送到 Telegram / Email / RSS

每个 fork 的产出都不一样——LLM 看你的 starred repos 推断你的口味,精排时按这份画像打分。

---

## 看一眼成品

→ **[Live demo · autumn1337.github.io/octozine](https://autumn1337.github.io/octozine/)**

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## 先决条件

| 你需要 | 用来 |
|---|---|
| 一个 GitHub 账号 | fork 这个 repo + 跑 Actions + 部署 Pages |
| 一个 OpenAI 兼容协议的 LLM API key | 排序 + 生成摘要 + 推断兴趣画像 |

**LLM key 去哪儿拿?** 任选一家:

| Provider | 注册地址 | 备注 |
|---|---|---|
| **DeepSeek**(推荐) | [platform.deepseek.com](https://platform.deepseek.com) | 性价比首选,国内可直连 |
| Moonshot (Kimi) | [platform.moonshot.cn](https://platform.moonshot.cn) | 中国 |
| 阿里 Qwen | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | 中国 |
| 智谱 GLM | [open.bigmodel.cn](https://open.bigmodel.cn) | 中国 |
| OpenAI | [platform.openai.com](https://platform.openai.com) | 默认走 `gpt-5.4-mini` |
| Groq | [console.groq.com](https://console.groq.com) | 免费档位够用,推理极快 |
| Ollama | 本地部署 | JSON mode 部分兼容,慎用 |

成本估算: 每期约 6 次 LLM 调用(1 次 rank + 5 次 summarize,首次额外 1 次画像生成)。按周跑,DeepSeek 一年 < ¥5,OpenAI 一年 < $1。具体单价以 provider 当前定价为准。

---

## 5 分钟开始

### Step 1 · Fork

→ [github.com/Autumn1337/octozine/fork](https://github.com/Autumn1337/octozine/fork)

### Step 2 · 在你 fork 后的 repo 里改 `config/config.yaml` 这 2 处

```yaml
github_username: <你的 GitHub username>     # ← 改这里。首次跑会拉你的 starred 推断兴趣画像

llm:
  provider: deepseek                        # ← 改成你拿了 key 的那家(见上表)
  # model: deepseek-v4-pro                  # ← 可选。不写就用 provider 默认 model;想换大模型/便宜模型来这里改
```

其他字段第一次都不用动。直接 commit 到你 fork 的 main。

> ℹ️ Fork 时仓库**不带** `config/profile.yaml`(只有一份 `.example`)。第一次跑时 octozine 会自动从你的 starred 推断画像并写一份 `profile.yaml` 进来 —— 你不用动手改这个文件。

### Step 3 · 把 LLM key 加到 secrets

repo Settings → Secrets and variables → Actions → **New repository secret**:

- **Name**: `LLM_API_KEY`
- **Value**: 你的 LLM API key

### Step 4 · 启用 GitHub Pages

repo Settings → Pages → **Source**: GitHub Actions

(不用选 branch——workflow 自己上传 artifact。)

### Step 5 · 跑一次

repo Actions → **Octozine Daily** → **Run workflow**(右上角)。

约 3 分钟后你会看到:

- ✅ Actions 跑通(若挂了见下方"常见问题")
- 📦 仓库里多 2 个 commit:
  - `data: issue 2026-WXX [skip ci]` ← 本周的 issue 数据 + auto-gen 的 `profile.yaml` + flip 回去的 `regenerate: false`
- 🌐 你的站点 live 在 `https://<你的 username>.github.io/<你的 repo 名>/`

之后每周一 09:00 UTC 自动跑。改时区/频率: `config/config.yaml` 里改 `schedule:`,然后 `npm install && npm run sync-cron && git push`。详见 [docs/setup.md](./docs/setup.md)。

---

## 跑完之后:你的兴趣画像

第一次跑时,LLM 读你最近 100 个 starred,生成 `config/profile.yaml` 并自动 commit 到 main,大概长这样:

```yaml
# generated 2026-05-07 from yourname's starred repos
# edit freely; this file is read each run.
themes:
  - LLM tooling and inference engines
  - Terminal UI / developer tools
  - Rust systems programming
languages: [rust, python, go, typescript]
exclude_themes:
  - blockchain / web3
notes: |
  Prefers low-level, performance-sensitive, developer-focused projects.
```

**这个文件就是你给 LLM 看的"我喜欢什么"**,可以随时手编——下次跑直接读你编辑后的版本。每次精排,LLM 把它和候选项目对比,给每个项目打分 + 一句中文 reason("为什么推它"),渲染在站点上。

想刷新画像(比如最近 starred 范围变了)? 把 `config/config.yaml` 里 `regenerate: true`,下次跑完自动重新生成并把 flag 翻回 false。

---

## 切换 LLM Provider 和模型

### 换 Provider

直接改 `config/config.yaml` 的 `provider:` 那一行,7 家任选(见下表)。

### 换 model

打开 `config/config.yaml`,`llm:` 块下面已经为每家 provider 准备了一行注释好的 `# model:` 例子。**找到你 provider 那一行,把前面的 `#` 去掉就行**:

```yaml
# 改前:
  # ── deepseek ── default `deepseek-v4-flash`  ·  stronger: deepseek-v4-pro
  #               docs: https://api-docs.deepseek.com/quick_start/pricing
  # model: deepseek-v4-pro

# 改后(把最后一行的 `#` 去掉):
  # ── deepseek ── default `deepseek-v4-flash`  ·  stronger: deepseek-v4-pro
  #               docs: https://api-docs.deepseek.com/quick_start/pricing
  model: deepseek-v4-pro
```

⚠️ 整个 `llm:` 块只能有一个 `model:` 启用——别同时取消两行注释。

想换成同家的别的 model? 改 `model:` 后面的字符串就行,例如 `model: deepseek-v4-pro` → `model: deepseek-chat`。各家可选 model 见下表 docs 链接。

### 默认值速查表

各家默认 model 和几个常见替代(全部 2026-05 验证过;最新列表点 docs):

| `provider:` | 默认模型 | 几个常见替代 | 当前 model 列表 |
|---|---|---|---|
| `openai` | `gpt-5.4-mini` | `gpt-5.4`, `gpt-5.5`, `gpt-4.1-mini` | [docs](https://platform.openai.com/docs/models) |
| `deepseek` | `deepseek-v4-flash` | `deepseek-v4-pro` | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `moonshot` | `moonshot-v1-128k` | `moonshot-v1-32k`, `kimi-k2-thinking` | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | `qwen-max`, `qwen3.6-plus`, `qwen3.6-flash` | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | `glm-4.5-flash`(免费), `glm-4.7` | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | `llama-3.3-70b-versatile`, `openai/gpt-oss-20b` | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | 任意你本地 `ollama pull` 过的 model | — |
| `custom` | — | 必填 `base_url` + `model` | — |

摘要质量对 model 不敏感——默认这档(基本都是各家最便宜的"flash / mini"挡)对 octozine 的 rank + summarize 任务已经够用。要更精确的精排原因 / 更长的双语摘要,可以试更大的 model,成本仍在毛分钱量级。

### 不在表里的 provider(xAI / Together / 自部署 vLLM 等)

```yaml
llm:
  provider: custom
  base_url: https://your-endpoint.example/v1
  model: your-model
```

---

## 推送渠道(可选)

默认情况下,**只发布到 GitHub Pages 和 RSS**(`/feed.xml` 自动生成,head 里有 `<link rel="alternate">`)。

如果想把每期推到别的地方:

| 渠道 | 默认状态 | 启用方式 |
|---|---|---|
| **GitHub Pages** | 永远开 | 已经在 5 分钟流程里启用 |
| **RSS / Atom** | 永远开 | 直接订阅 `https://<你>.github.io/<repo>/feed.xml` |
| **Telegram bot** | 关 | config 改 `enabled: true` + 加 `TELEGRAM_BOT_TOKEN` secret |
| **Email (SMTP)** | 关 | config 改 `enabled: true` + 加 `SMTP_HOST/PORT/USER/PASS/FROM` secrets |

完整配置和 secret 申请步骤见 [docs/setup.md → 推送渠道](./docs/setup.md#optional-push-channels-telegram--email--rss)。

推送在 Pages 部署**之后**作为独立 Action step 跑,设置错了**不会**阻塞站点发布。

---

## 历史归档

每期都会自动 commit 到 `data/issues/<slug>.json` 并发布到 archive 页:

![archive](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/archive.png)

git 历史就是你的归档,既能在站点 archive 页看,也能直接在 repo 里翻 commit 历史。

---

## 常见问题

**Q: 第一次跑挂了,日志写 `profile generation: yourname has zero starred repos`**
→ `config.yaml` 里 `github_username` 还是默认值 `yourname`。改成你的 GitHub username。

**Q: 日志写 `LLM HTTP 401`**
→ 三种可能:(a) `LLM_API_KEY` secret 没设;(b) key 写错了;(c) key 不属于 `provider:` 指定的那家(比如 OpenAI key 配了 `provider: deepseek`)。

**Q: 日志写 `only 1/3 fetchers survived`**
→ 多源同时挂——通常是临时网络问题,重跑一次。如果 `search` 抓挂了出 403,大概率是 GitHub API 匿名速率限制(60 req/h),加个 `GH_TOKEN` secret 提到 5000 req/h(任意 PAT 都行,不需要特殊权限)。

**Q: Actions 显示绿,但站点 404 / 没样式**
→ Settings → Pages → Source 没选 GitHub Actions(可能选了 Branch)。改回去重跑一次 workflow。

**Q: 同一周想再跑一次刷新内容**
→ 默认会被 history dedup 拦下来报 `zero fresh candidates`。临时方案:删掉 `data/issues/<本周>.json` 和 `data/seen.json` 里对应的 entry,或在 `config.yaml` 把 `history_window` 设 0 跑完再改回来。

**Q: 我想让画像偏向某个方向(比如纯 Rust)**
→ 直接手编 `config/profile.yaml`——下次跑用的就是你编辑后的版本。`themes:` / `languages:` / `exclude_themes:` / `notes:` 四个字段,LLM 都会读。

**Q: 想换日刊**
→ `config.yaml` 改 `schedule: daily`,然后本地跑 `npm install && npm run sync-cron`,提交 `.github/workflows/daily.yml` 的改动。`sync-cron` 脚本会把 schedule 翻译成 workflow cron 表达式。

更多见 [docs/setup.md → Troubleshooting](./docs/setup.md#troubleshooting)。

---

## 为什么不直接用现成的工具

| 工具 | 它做什么 | Octozine 不一样的地方 |
|---|---|---|
| `GitHubDaily` | 人工运营,中文 README 大杂烩 | 全自动 + 个性化 + 可 fork |
| `agents-radar` | 跟踪固定的 AI repo 列表 | 真 trending discovery,不预设 repo |
| `Horizon` | 抓 HN/Reddit/Twitter | 重点抓 GitHub trending + LLM 个性化 rank |

简单说: 别人是给所有人看同一份内容,Octozine 是**每个 fork 都不一样**。

---

## 项目结构

```
octozine/
├─ src/
│   ├─ fetchers/{trending,search,hn,events}.ts    # 4 个数据源
│   ├─ pipeline/{dedup,history,profile,rank,summarize}.ts
│   ├─ llm/                                       # OpenAI 兼容协议 + provider registry
│   ├─ push/{telegram,email,markdown}.ts          # 推送渠道
│   ├─ render/build-issue.ts
│   ├─ index.ts                                   # `npm run pipeline`
│   └─ push.ts                                    # `npm run push`
├─ web/                                           # Astro 杂志风站
├─ config/                                        # 你的配置(每个文件 < 30 行)
│   ├─ config.yaml                                # provider / schedule / sources / outputs
│   └─ profile.yaml                               # 兴趣画像(可手编 / 可重新生成)
├─ data/                                          # 状态(git-tracked)
│   ├─ issues/<slug>.json                         # 每期完整快照
│   └─ seen.json                                  # 历史去重 { "owner/repo": "issue_slug" }
└─ .github/workflows/daily.yml                    # cron + Pages + push
```

---

## 本地开发

```bash
git clone https://github.com/<你>/octozine
cd octozine
npm install
npm test                                    # 79 tests, 18 files

# 跑一次 pipeline 看真实输出(要 LLM_API_KEY 环境变量)
export LLM_API_KEY="sk-..."
npm run pipeline                            # 输出 data/issues/<slug>.json

# 本地预览 Astro 站
cd web && npm install && npm run dev        # http://localhost:4321/
```

代理(中国大陆,本地跑用):
```bash
export HTTPS_PROXY="http://127.0.0.1:<你的代理端口>"
export NODE_USE_ENV_PROXY=1                 # Node 24+ 必需
```

GitHub Actions 不需要代理。

---

## 设计文档

- 架构和设计决策: [docs/design.md](./docs/design.md)
- 用户 setup 详解: [docs/setup.md](./docs/setup.md)

---

## License

MIT — 用、改、分发都随意。
