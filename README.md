<h1 align="center">Octozine</h1>

<p align="center">
  <em>A folio of GitHub, curated weekly.</em>
  <br>
  Fork 一下,自动生成<strong>只属于你的</strong> GitHub 项目周刊。
</p>

<p align="center">
  <a href="./README.md">中文</a> · <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <a href="https://autumn1337.github.io/octozine/">
    <img src="https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/banner.png" width="720" alt="Octozine — a folio of GitHub, curated weekly">
  </a>
</p>

<p align="center">
  <a href="https://github.com/Autumn1337/octozine/actions"><img src="https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square" alt="tests"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
  <a href="https://autumn1337.github.io/octozine/"><img src="https://img.shields.io/badge/demo-live-success?style=flat-square" alt="demo"></a>
</p>

<p align="center">
  <a href="https://autumn1337.github.io/octozine/">Live demo</a>
  ·
  <a href="#5-分钟跑起来">5 分钟跑起来</a>
  ·
  <a href="./docs/setup.md">Setup</a>
  ·
  <a href="./docs/design.md">Design</a>
</p>

---

## 不是普通 Trending

普通 GitHub Trending 给所有人同一份榜单。Octozine 会读取你的 GitHub 信号:

- profile / bio
- 自己维护的 public repos
- 最近 public activity
- starred repos
- 代表性 README 摘要

然后每周从 GitHub Trending、Search API、Hacker News 等来源里挑出最适合你的项目,生成带解释的杂志页。

```text
Your GitHub signals
profile · owned repos · activity · stars · README
        ↓
Discovery sources
Trending · Search · HN · Events
        ↓
LLM curator
rank · explain · summarize
        ↓
Your weekly zine
GitHub Pages · RSS · Telegram · Email
```

每个 fork 都会生成不同内容。你看到的不是“今天大家在看什么”,而是“这些项目为什么适合你”。

---

## 5 分钟跑起来

开始前先准备一个 OpenAI 兼容协议的 LLM API key。推荐用 [DeepSeek](https://platform.deepseek.com),也可以用 OpenAI、Qwen、Moonshot、Zhipu、Groq、Ollama 或自定义 endpoint。

下面步骤都在 GitHub 网页完成,不需要 clone 到本地。

### 1. Fork

点 [Fork this repo](https://github.com/Autumn1337/octozine/fork)。之后所有操作都在你的 fork 里完成。

### 2. 改两行配置

打开 `config/config.yaml`,点右上角铅笔编辑:

```yaml
github_username: yourname
llm:
  provider: deepseek
```

把 `yourname` 换成你的 GitHub username,把 `provider` 换成你拿到 key 的那家(完整列表见下方 [LLM Provider](#llm-provider))。页面底部直接 **Commit changes** 到 main。

### 3. 添加 secret

进入你的 fork:

`Settings → Secrets and variables → Actions → New repository secret`

- **Name**: `LLM_API_KEY`
- **Secret**: 粘贴你的 LLM API key

**⚠️ 强烈建议同时加一个 `GH_TOKEN` secret**(任意 GitHub Personal Access Token,不需要任何特殊 scope):

- 不加:GitHub API 匿名速率限制 **60 req/h**,octozine 一次跑用 ~30 个,连续两次就撞墙挂掉
- 加了:**5000 req/h**,几乎不用关心

拿 token:[github.com/settings/tokens](https://github.com/settings/tokens) → Tokens (classic) → Generate new token → scopes 不勾任何 → 复制 `ghp_...` → 同位置加 secret 名字 `GH_TOKEN`。

### 4. 启用 GitHub Pages

进入:

`Settings → Pages`

- **Source** 选择 **GitHub Actions**

不要选 "Deploy from a branch",否则站点通常会 404 或样式异常。

### 5. 手动跑一次

进入:

`Actions → Octozine Daily → Run workflow`

3-5 分钟后,main 分支会多一个 commit:

```text
data: issue 2026-W19 [skip ci]
  data/issues/2026-W19.json
  config/profile.yaml
```

站点地址:

```text
https://yourname.github.io/octozine/
```

之后默认每周一 09:00 UTC 自动运行。改频率见 [docs/setup.md](./docs/setup.md)。

---

## 它生成什么

每期从 ~150 个候选(Trending / Search / HN)里精选 **默认 8 个**项目(可在 `config/config.yaml` 改 `top_n`,例如 `top_n: 12` 看更多,或 `top_n: 5` 走精选感)。每个项目带:

- 中英双语摘要
- 中文“为什么推它”
- 命中的 profile theme / language
- 来源信号,例如 Trending + HN
- RSS feed
- 可选 Telegram / Email 推送

核心不是把项目列出来,而是解释它为什么出现在你的周刊里。

---

## 个性化画像

第一次运行时,Octozine 会生成 `config/profile.yaml`。这是一个可手编的 v2 profile:

```yaml
version: 2
core_themes:
  - name: LLM tooling and inference engines
    weight: 0.92
    confidence: high
    evidence:
      - source: owned_repo
        repo: yourname/inference-bench
        note: Owned repo about local inference benchmarking.
languages:
  - name: rust
    weight: 0.86
    evidence_count: 14
exclude_themes:
  - name: blockchain / web3
    confidence: medium
    reason: Explicitly excluded or rarely appears in strong signals.
```

完整结构见 [config/profile.yaml.example](./config/profile.yaml.example)。

想明确告诉它你的偏好,可以改 `config/config.yaml`:

```yaml
profile:
  regenerate: false
  include: [rust cli, local inference]
  exclude: [crypto, marketing automation]
```

想重建画像,把 `regenerate` 改成 `true`,下次运行后会自动翻回 `false`。

---

## LLM Provider

```yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro
```

| `provider` | 默认模型 | 注册地址 | 模型列表 |
|---|---|---|---|
| **`deepseek`** | `deepseek-v4-flash` | [platform.deepseek.com](https://platform.deepseek.com) | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `openai` | `gpt-5.4-mini` | [platform.openai.com](https://platform.openai.com) | [docs](https://platform.openai.com/docs/models) |
| `moonshot` | `moonshot-v1-128k` | [platform.moonshot.cn](https://platform.moonshot.cn) | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | [open.bigmodel.cn](https://open.bigmodel.cn) | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | [console.groq.com](https://console.groq.com) | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | 本地 | - |
| `custom` | - | 任何 OpenAI 兼容 endpoint | 自填 `base_url` + `model` |

DeepSeek 是默认推荐,便宜、速度够用。每期常态下约 9 次 LLM 调用(rank + 8 summarize),首次或重建画像时额外 2 次(profile extract + critic)。

### 真实成本预估(按周跑,默认 `top_n: 8`)

| Provider · model | 首次跑(11 调用) | 月度估算(4 期) | 备注 |
|---|---|---|---|
| **DeepSeek `v4-flash`**(默认) | ≈ ¥0.07 | ≈ ¥0.3 | 性价比首选 |
| **DeepSeek `v4-pro`** | ≈ ¥0.8(实测 `top_n: 5` 时 ¥0.6 / 18 分钟) | ≈ ¥3 | 质量更高但慢 5-10× |
| **OpenAI `gpt-5.4-mini`** | ≈ $0.07 | ≈ $0.3 | |
| **Qwen `qwen-plus`** | ≈ ¥0.07 | ≈ ¥0.3 | |
| **Zhipu `glm-4.5-air`** | ≈ ¥0.07 | ≈ ¥0.3 | |
| **Groq `llama-3.1-8b-instant`** | 免费档位通常够 | ≈ $0 | 推理极快 |
| **Ollama** 本地 | $0 | $0 | 需要本地 GPU,JSON mode 部分兼容 |
| Moonshot 128k context | 偏贵,以官方定价为准 | — | 128k 上下文 model 单价高 |

**`v4-flash` 一年成本 < ¥5,按周自动跑成本可忽略。** 想把 `pro` / `gpt-5.5` 这种高端 model 当 default,实测一年约 ¥30-40,但首次跑会慢到 20-25 分钟。把 `top_n` 调回 5 能把成本和时长都砍 ~30%。

---

## 推送渠道

默认发布到 GitHub Pages,并生成 RSS:

```text
https://yourname.github.io/octozine/feed.xml
```

| 渠道 | 默认 | 启用方式 |
|---|---|---|
| GitHub Pages | 开 | 5 分钟流程已启用 |
| RSS | 开 | 自动生成 `/feed.xml` |
| Telegram | 关 | config 开启 + `TELEGRAM_BOT_TOKEN` secret |
| Email | 关 | config 开启 + SMTP secrets |

完整配置见 [docs/setup.md](./docs/setup.md)。

---

## 常见问题

**第一次运行失败,日志里有 `no usable GitHub signals`**

`github_username` 可能还是 `yourname`,或这个账号没有可读的 public repos / starred repos / activity。

**`LLM HTTP 401`**

`LLM_API_KEY` 没设,或 key 不属于当前 `provider`。

**`only 1/3 fetchers survived`**

通常是临时网络或 GitHub API rate limit。加 `GH_TOKEN` secret 可以把匿名 60 req/h 提高到 5000 req/h。

**Actions 成功,但页面 404 / 没样式**

GitHub Pages 的 Source 没选 **GitHub Actions**。

更多排错见 [docs/setup.md](./docs/setup.md)。

---

## 为什么不用现成工具

| 工具 | 它做什么 | Octozine 不一样 |
|---|---|---|
| `GitHubDaily` | 人工运营的通用项目列表 | 全自动 + 个性化 + 可 fork |
| `agents-radar` | 跟踪固定 AI repo 列表 | 真 discovery,不预设 repo |
| `Horizon` | 聚合 HN / Reddit / Twitter | 重点是 GitHub 项目 + 个人画像排序 |

别人给所有人看同一份内容。Octozine 让每个 fork 都不一样。

---

## 开发

```bash
npm install
npm test
npm run typecheck
```

运行完整 pipeline 需要 `LLM_API_KEY`:

```bash
LLM_API_KEY=sk-... npm run pipeline
```

更多:

- [docs/setup.md](./docs/setup.md)
- [docs/design.md](./docs/design.md)
- [README_EN.md](./README_EN.md)

## License

MIT
