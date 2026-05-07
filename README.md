# Octozine · GitHub 项目周刊

[中文](./README.md) · [English](./README_EN.md)

> **A folio of GitHub, curated weekly.**
> 自部署、AI 增强、个性化的 GitHub 项目发现工具。Fork 5 分钟拥有你自己的 GitHub 周刊。

[![demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://autumn1337.github.io/octozine/)
[![tests](https://img.shields.io/badge/tests-41%20passing-brightgreen?style=flat-square)](https://github.com/Autumn1337/octozine/actions)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

![hero](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png)

---

## 它是什么

Octozine 每周自动从 **GitHub Trending** 抓取项目，用 **LLM 按你的兴趣**排序、生成 **中英双语**摘要，然后部署一个**杂志风**的 GitHub Pages 站点。

**和现有同类工具的差异**：

| 工具 | 它做什么 | Octozine 不一样的地方 |
|---|---|---|
| `GitHubDaily` | 人工运营，中文 README 大杂烩 | 全自动 + 个性化 + 可 fork |
| `agents-radar` | 跟踪固定的 AI repo 列表 | 真 trending discovery，不预设 repo |
| `Horizon` | 抓 HN/Reddit/Twitter | 重点抓 GitHub trending + LLM 个性化 rank |

---

## 5 分钟开始

1. **Fork 这个仓库** → `https://github.com/<你>/octozine`
2. **加 secret**：repo Settings → Secrets → New: `LLM_API_KEY` = 你的 LLM key
3. **启用 Pages**：repo Settings → Pages → Source: GitHub Actions
4. **触发首次运行**：repo Actions → Octozine Daily → Run workflow

约 3 分钟后：
- 站点 live 在 `https://<你>.github.io/octozine/`
- 自动 commit 每周一期 `data/issues/<slug>.json`
- workflow 周一 09:00 UTC 自动跑

完整版见 [docs/setup.md](./docs/setup.md)。

---

## 一行切换 LLM Provider

```yaml
# config/config.yaml
llm:
  provider: deepseek      # ← 改成下表任意一个
```

| `provider:` | 默认模型 | 备注 |
|---|---|---|
| `openai` | `gpt-4o-mini` | OpenAI 官方 |
| `deepseek` | `deepseek-v4-flash` | 性价比高，国内可用 |
| `moonshot` | `moonshot-v1-128k` | Kimi（中国）|
| `qwen` | `qwen-plus` | 阿里 DashScope |
| `zhipu` | `glm-4.5` | 智谱 GLM |
| `groq` | `llama-3.1-8b-instant` | 推理极快 |
| `ollama` | `llama3.1` | 本地（JSON mode 部分兼容） |
| `custom` | — | 任意 OpenAI 兼容 endpoint |

要 override 默认 model：`model: deepseek-v4-pro`。要换不在表里的 provider：`provider: custom` + `base_url` + `model`。

---

## 个性化你的发现

**首次运行时自动从你最近 100 个 starred 项目生成 `config/profile.yaml`**，可随意手编；改了 starred 后想刷新画像，把 `config/config.yaml` 里的 `profile.regenerate: true`，下次跑完会自动翻回 false。

`config/profile.yaml` 描述你的兴趣，LLM 按这份"画像"做精排：

```yaml
themes:
  - "LLM tooling and inference engines"
  - "Terminal UI / developer tools"
  - "Rust systems programming"
languages: [rust, python, go, typescript]
exclude_themes:
  - "blockchain / web3"
notes: |
  Prefers low-level, performance-sensitive, developer-focused projects.
```

每个推荐项目都附一句中文 **curator reason**（"为什么推它"），渲染在站点上：

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## 历史归档

每期 issue 自动归档为 git 历史 + Pages 上的 archive 页：

![archive](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/archive.png)

---

## 目录结构

```
octozine/
├─ src/                    # pipeline (TypeScript)
│   ├─ fetchers/trending.ts    # 爬 GitHub trending
│   ├─ pipeline/{dedup,rank,summarize}.ts
│   ├─ llm/                # OpenAI 兼容 + provider registry
│   └─ render/build-issue.ts
├─ web/                    # Astro 杂志风站
├─ config/                 # 你的配置（5 分钟看完）
│   ├─ config.yaml         # provider / schedule / sources
│   └─ profile.yaml        # 兴趣画像
├─ data/issues/            # 历史 issue（git 追踪）
└─ .github/workflows/daily.yml   # cron + Pages 部署
```

---

## 本地开发

```bash
git clone https://github.com/Autumn1337/octozine
cd octozine
npm install
npm test                   # 41 tests, 10 files

# 跑一次 pipeline 看真实输出
export LLM_API_KEY="sk-..."
npm run pipeline           # 输出 data/issues/<slug>.json

# 本地预览 Astro 站
cd web && npm install && npm run dev   # http://localhost:4321/
```

代理（中国大陆）：

```bash
export HTTPS_PROXY="http://127.0.0.1:<你的代理端口>"
export NODE_USE_ENV_PROXY=1   # Node 24+ 必需
```

---

## 设计文档

- 完整 spec：[docs/superpowers/specs/2026-05-06-octozine-design.md](./docs/superpowers/specs/2026-05-06-octozine-design.md)
- 实现 plans：[docs/superpowers/plans/](./docs/superpowers/plans/)
- 用户 setup：[docs/setup.md](./docs/setup.md)

---

## License

MIT — 用、改、分发都随意。
