# Octozine · GitHub 项目周刊

[中文](./README.md) · [English](./README_EN.md)

> 自部署、AI 增强的 GitHub 项目发现工具。
> Fork 一下,每周自动给你一份**只为你定制的** GitHub 项目周刊。

[![demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://autumn1337.github.io/octozine/)
[![tests](https://img.shields.io/badge/tests-80%20passing-brightgreen?style=flat-square)](https://github.com/Autumn1337/octozine/actions)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

![hero](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png)

→ Live demo: **[autumn1337.github.io/octozine](https://autumn1337.github.io/octozine/)**

---

## 它是什么

每周一,Octozine 在你 fork 的 repo 里跑一遍 GitHub Actions:

1. **抓** ~150 个候选项目(GitHub Trending / Search API / Hacker News)
2. **排** LLM 按你的兴趣画像精选 top 5
3. **写** 每个项目一段中英摘要 + 一句中文"为什么推它"
4. **发** 部署成杂志风的 GitHub Pages 站,可选推到 Telegram / Email / RSS

兴趣画像由 LLM 读你的 starred repos 推断 —— **每个 fork 的产出都不一样**。

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## 5 分钟跑起来

**先决条件**: 一个 GitHub 账号 + 一家 OpenAI 兼容协议的 LLM key(见下方 [provider 表](#切换-llm-provider))。

1. **Fork** → [github.com/Autumn1337/octozine/fork](https://github.com/Autumn1337/octozine/fork)
2. **改 `config/config.yaml` 两行**:
   ```yaml
   github_username: <你的 GitHub username>
   llm:
     provider: deepseek          # ← 改成你拿了 key 的那家
   ```
3. **加 secret**:Settings → Secrets and variables → Actions → New repository secret
   - Name: `LLM_API_KEY`,Value: 你的 key
4. **启用 Pages**:Settings → Pages → Source: **GitHub Actions**
5. **跑**:Actions → **Octozine Daily** → Run workflow

约 3 分钟后:
- ✅ Action 跑通,自动 commit `data/issues/<slug>.json` + 自动生成的 `profile.yaml` 回 main
- 🌐 站点 live 在 `https://<你的 username>.github.io/<repo>/`
- 📅 之后每周一 09:00 UTC 自动跑(改频率见 [setup.md](./docs/setup.md))

挂了见下方[常见问题](#常见问题),完整指南在 [docs/setup.md](./docs/setup.md)。

---

## 个性化:你的兴趣画像

LLM 读你最近 100 个 starred,自动生成 `config/profile.yaml` 并 commit 回 main:

```yaml
# generated 2026-05-07 from yourname's starred repos
themes:
  - LLM tooling and inference engines
  - Terminal UI / developer tools
  - Rust systems programming
languages: [rust, python, go, typescript]
exclude_themes: [blockchain / web3]
notes: |
  Prefers low-level, performance-sensitive, developer-focused projects.
```

精排时 LLM 拿这份画像和候选对比打分。**文件可以随时手编**,下次跑就用你编辑后的版本。
想刷新? `config.yaml` 改 `regenerate: true`,下次跑后自动翻回 false。

---

## 切换 LLM Provider

```yaml
# config/config.yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro    # ← 可选;config.yaml 里每家都有现成的注释例子
```

| `provider:` | 默认模型 | 注册地址 | 当前 model 列表 |
|---|---|---|---|
| **`deepseek`** ⭐ | `deepseek-v4-flash` | [platform.deepseek.com](https://platform.deepseek.com) | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `openai` | `gpt-5.4-mini` | [platform.openai.com](https://platform.openai.com) | [docs](https://platform.openai.com/docs/models) |
| `moonshot` | `moonshot-v1-128k` | [platform.moonshot.cn](https://platform.moonshot.cn) | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | [open.bigmodel.cn](https://open.bigmodel.cn) | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | [console.groq.com](https://console.groq.com) | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | 本地 | — |
| `custom` | — | 任何 OpenAI 兼容 endpoint,自填 `base_url` + `model` | — |

⭐ DeepSeek 性价比最高 + 国内可直连,作为推荐默认。摘要质量对 model 不敏感,默认这档够用。

**成本**:每期约 6 次 LLM 调用。按周跑,DeepSeek 一年 < ¥5,OpenAI 一年 < $1。

**换 model**: 打开 `config/config.yaml`,`llm:` 块下每家 provider 都有一行 `# model:` 例子,取消对应那行的注释即可(只能取消一行)。

---

## 推送渠道

默认只发 **GitHub Pages + RSS**(`/feed.xml` 自动生成)。

| 渠道 | 默认 | 启用方式 |
|---|---|---|
| GitHub Pages + RSS | 永远开 | 已经在 5 分钟流程里启用 |
| Telegram bot | 关 | config 加 `enabled: true` + `TELEGRAM_BOT_TOKEN` secret |
| Email (SMTP) | 关 | config 加 `enabled: true` + `SMTP_HOST/PORT/USER/PASS/FROM` secrets |

完整配置见 [setup.md → 推送渠道](./docs/setup.md#optional-push-channels-telegram--email--rss)。推送是独立 Action step 在 Pages 部署**之后**跑,挂了不影响站点发布。

---

## 常见问题

**第一次跑挂,日志写 `zero starred repos`** → `config.yaml` 里 `github_username` 还是默认值 `yourname`。

**`LLM HTTP 401`** → secret `LLM_API_KEY` 没设,或 key 不属于 `provider:` 那家。

**`only 1/3 fetchers survived`** → 临时网络问题重跑;或 GitHub API 匿名速率限制 60 req/h(加 `GH_TOKEN` secret 提到 5000)。

**Actions 绿,但站点 404 / 没样式** → Settings → Pages → Source 没选 GitHub Actions。

更多见 [setup.md → Troubleshooting](./docs/setup.md#troubleshooting)。

---

## 为什么不用现成的工具

| 工具 | 它做什么 | Octozine 不一样 |
|---|---|---|
| `GitHubDaily` | 人工运营,中文 README 大杂烩 | 全自动 + 个性化 + 可 fork |
| `agents-radar` | 跟踪固定的 AI repo 列表 | 真 trending,不预设 repo |
| `Horizon` | 抓 HN / Reddit / Twitter | 重点抓 GitHub trending + LLM 个性化 rank |

别人是给所有人看同一份内容,Octozine **每个 fork 都不一样**。

---

## 进一步

- **设计和架构** → [docs/design.md](./docs/design.md)(19 节,含数据源、LLM 适配、个性化机制、错误处理、实现顺序、决策记录)
- **详细 setup** → [docs/setup.md](./docs/setup.md)(完整 troubleshooting + GH_TOKEN + 推送 secrets)
- **本地开发** → `npm install && npm test`,跑 pipeline 要 `LLM_API_KEY` env

## License

MIT
