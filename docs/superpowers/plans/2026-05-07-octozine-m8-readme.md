# Octozine M8: README + demo + repo metadata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Make Octozine **discoverable and instantly understandable** to anyone who lands on the GitHub repo. Hero screenshot + 5-minute quickstart + provider table + clear differentiation. Works as the recruitment funnel: "land → understand → fork in 5 min."

**Architecture:** Two READMEs (中文 default, English secondary). One MIT LICENSE. A `docs/images/` folder with real screenshots of the deployed site. GitHub repo metadata (description + topics) set via `gh` CLI in the final step.

**Tech stack:** Markdown only (no code). Screenshots produced via Playwright MCP against the live site `https://autumn1337.github.io/octozine/`.

**Reference:** spec §16 of `docs/superpowers/specs/2026-05-06-octozine-design.md`.

---

## Scope

**In scope (M8)**:
- `README.md` (中文, primary, GitHub renders as default)
- `README_EN.md` (English mirror, linked from top of CN README)
- `LICENSE` (MIT)
- `docs/images/` — 3 real screenshots from deployed site:
  - `hero.png` — first viewport of `/octozine/` (header + hero project)
  - `list.png` — items 02-05 area
  - `archive.png` — `/octozine/archive/` listing
- GitHub repo metadata: description + topics

**Out of scope** (later):
- demo GIF (静态截图够用，GIF 工具复杂；推广反馈再补)
- Multi-language past beyond 中/English (e.g. JP, fr — overkill)
- Animated/interactive readme (非必要)
- M4 events fetcher demo
- Profile auto-gen demo (M6)
- Push channel demos (M7)

---

## File map

| File | Purpose |
|---|---|
| `README.md` | Chinese README (primary, GitHub renders as default landing) |
| `README_EN.md` | English mirror |
| `LICENSE` | MIT (full text) |
| `docs/images/hero.png` | Screenshot of deployed site's hero block |
| `docs/images/list.png` | Screenshot of items list area |
| `docs/images/archive.png` | Screenshot of archive page |

---

## Conventions

- Both READMEs link to each other at the top: 「中文 / English」
- All image references use **absolute GitHub raw URLs** (e.g. `https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png`) so the README renders correctly when forked or viewed off-GitHub
- Provider table reuses content from `docs/setup.md` (single source of truth — link to setup.md for full details)
- Commit per-section: screenshots → CN README → EN README → LICENSE → repo metadata

---

## Task 1: Capture screenshots from deployed site

**Files:** Create `docs/images/hero.png`, `docs/images/list.png`, `docs/images/archive.png`.

The site is live at https://autumn1337.github.io/octozine/. Use Playwright MCP (`mcp__plugin_playwright_playwright__*` tools available to general-purpose subagents) to take 3 viewport screenshots.

### Step 1.1: Set up screenshot environment

Configure browser at desktop resolution (1280x800). Disable any system theme overrides. Use Playwright MCP `browser_resize` then `browser_navigate`.

### Step 1.2: Capture `hero.png`

Navigate to `https://autumn1337.github.io/octozine/`, wait for page to fully render, screenshot the area covering the header + hero (FEATURED + project title + summary block). Save to `docs/images/hero.png`.

If the Playwright snapshot tool only supports full page, take a full-page shot and we'll crop later. Aim for: header + hero block visible, no items below.

### Step 1.3: Capture `list.png`

Same page, scroll down to the items area (Also worth a look section), screenshot ~600px tall covering items 02-05. Save to `docs/images/list.png`.

### Step 1.4: Capture `archive.png`

Navigate to `https://autumn1337.github.io/octozine/archive/`, screenshot the issue list. Save to `docs/images/archive.png`.

### Step 1.5: Verify file sizes are reasonable

```bash
ls -la docs/images/
```
Each PNG should be < 500 KB (if larger, that's fine, but check no obvious bloat).

### Step 1.6: Commit screenshots
```bash
git add docs/images/
git commit -m "docs: add deployed-site screenshots for README"
```

---

## Task 2: Chinese `README.md` (primary)

**Files:** Create `README.md` at project root.

### Step 2.1: Write `README.md`

````markdown
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
````

### Step 2.2: Verify all relative links exist

```bash
for f in docs/setup.md LICENSE README_EN.md docs/superpowers/specs/2026-05-06-octozine-design.md; do
  test -e "$f" || echo "MISSING: $f"
done
```

(LICENSE and README_EN.md will be created in later tasks; expect them to be missing here, that's OK — they'll exist by end of plan.)

### Step 2.3: Commit
```bash
git add README.md
git commit -m "docs: chinese README with hero image, provider table, quickstart"
```

---

## Task 3: English `README_EN.md`

**Files:** Create `README_EN.md` at project root.

### Step 3.1: Write `README_EN.md`

Mirror of CN README, content-equivalent but native English. Same image URLs, same structure.

````markdown
# Octozine · A weekly folio of GitHub

[中文](./README.md) · [English](./README_EN.md)

> A self-deployable, AI-augmented, personalized GitHub discovery tool.
> Fork it, then in 5 minutes you have your own weekly GitHub digest.

[![demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://autumn1337.github.io/octozine/)
[![tests](https://img.shields.io/badge/tests-41%20passing-brightgreen?style=flat-square)](https://github.com/Autumn1337/octozine/actions)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

![hero](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png)

---

## What is it

Octozine pulls projects from **GitHub Trending** weekly, uses an **LLM** to rank them by **your interests**, generates **bilingual (zh + en) summaries**, and deploys a **magazine-style** GitHub Pages site.

**vs other tools**:

| Tool | What it does | What Octozine does differently |
|---|---|---|
| `GitHubDaily` | Hand-curated Chinese README list | Fully automated + personalized + forkable |
| `agents-radar` | Tracks a preset list of AI repos | Real trending discovery, no preset repo list |
| `Horizon` | Aggregates HN / Reddit / Twitter | Focuses on GitHub trending + LLM personalization |

---

## 5 minutes to first issue

1. **Fork this repo** → `https://github.com/<you>/octozine`
2. **Add a secret**: repo Settings → Secrets → New: `LLM_API_KEY` = your LLM key
3. **Enable Pages**: repo Settings → Pages → Source: GitHub Actions
4. **Trigger the first run**: repo Actions → Octozine Daily → Run workflow

In ~3 minutes:
- Site is live at `https://<you>.github.io/octozine/`
- A commit `data: issue <slug> [skip ci]` lands on `main`
- Workflow runs every Monday 09:00 UTC from then on

Full guide: [docs/setup.md](./docs/setup.md).

---

## One-line LLM provider switch

```yaml
# config/config.yaml
llm:
  provider: deepseek      # ← change to any below
```

| `provider:` | Default model | Notes |
|---|---|---|
| `openai` | `gpt-4o-mini` | OpenAI official |
| `deepseek` | `deepseek-v4-flash` | Cheap, fast, China-friendly |
| `moonshot` | `moonshot-v1-128k` | Kimi (China) |
| `qwen` | `qwen-plus` | Alibaba DashScope |
| `zhipu` | `glm-4.5` | Zhipu / GLM |
| `groq` | `llama-3.1-8b-instant` | Very fast inference |
| `ollama` | `llama3.1` | Local (JSON mode partially supported) |
| `custom` | — | Any OpenAI-compatible endpoint |

Override the model: `model: deepseek-v4-pro`. For providers not in the table: `provider: custom` + `base_url` + `model`.

---

## Personalize your discoveries

`config/profile.yaml` describes your interests; the LLM ranks candidates against this profile:

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

Each recommended project gets a short Chinese **curator reason** ("why this one"), shown on the site:

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## History archive

Every issue is committed to git AND published to an archive page:

![archive](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/archive.png)

---

## Project layout

```
octozine/
├─ src/                    # pipeline (TypeScript)
│   ├─ fetchers/trending.ts    # scrape GitHub trending
│   ├─ pipeline/{dedup,rank,summarize}.ts
│   ├─ llm/                # OpenAI-compatible adapter + provider registry
│   └─ render/build-issue.ts
├─ web/                    # Astro magazine-style site
├─ config/                 # your settings (5-min scan)
│   ├─ config.yaml         # provider / schedule / sources
│   └─ profile.yaml        # interest profile
├─ data/issues/            # historical issues (git-tracked)
└─ .github/workflows/daily.yml   # cron + Pages deploy
```

---

## Local development

```bash
git clone https://github.com/Autumn1337/octozine
cd octozine
npm install
npm test                   # 41 tests, 10 files

# Run pipeline locally to see real output
export LLM_API_KEY="sk-..."
npm run pipeline           # writes data/issues/<slug>.json

# Local preview of the Astro site
cd web && npm install && npm run dev   # http://localhost:4321/
```

Behind a proxy (China):
```bash
export HTTPS_PROXY="http://127.0.0.1:<your-proxy-port>"
export NODE_USE_ENV_PROXY=1   # required on Node 24+
```

---

## Design docs

- Full spec: [docs/superpowers/specs/2026-05-06-octozine-design.md](./docs/superpowers/specs/2026-05-06-octozine-design.md)
- Implementation plans: [docs/superpowers/plans/](./docs/superpowers/plans/)
- Setup guide: [docs/setup.md](./docs/setup.md)

---

## License

MIT — use, modify, distribute freely.
````

### Step 3.2: Commit
```bash
git add README_EN.md
git commit -m "docs: english README mirroring CN version"
```

---

## Task 4: `LICENSE`

**Files:** Create `LICENSE` at project root.

### Step 4.1: Write standard MIT license

```
MIT License

Copyright (c) 2026 Autumn1337

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Step 4.2: Commit
```bash
git add LICENSE
git commit -m "docs: MIT license"
```

---

## Task 5: GitHub repo metadata via `gh` CLI

**Files:** No file changes; only modifies remote repo metadata.

### Step 5.1: Set repo description + topics

```bash
gh repo edit Autumn1337/octozine \
  --description "🗞️ A folio of GitHub, curated weekly. Self-deployable, AI-augmented, personalized — fork & go in 5 minutes." \
  --homepage "https://autumn1337.github.io/octozine/" \
  --add-topic "github-trending" \
  --add-topic "discovery" \
  --add-topic "llm" \
  --add-topic "personalized" \
  --add-topic "astro" \
  --add-topic "static-site" \
  --add-topic "github-actions" \
  --add-topic "openai-compatible" \
  --add-topic "deepseek" \
  --add-topic "weekly-digest"
```

### Step 5.2: Verify

```bash
gh repo view Autumn1337/octozine --json description,homepageUrl,repositoryTopics
```
Expected: description set, homepageUrl set, topics list contains all 10 topics.

(No commit — gh CLI mutates remote metadata, not git history.)

---

## Task 6: Final verification

### Step 6.1: All tests still pass
```bash
npm test
```
Expected: 41 tests, all green (M8 doesn't add code, just docs).

### Step 6.2: Web build still works
```bash
cd web && npm run build && cd ..
```

### Step 6.3: Verify README image URLs resolve

After push to main, check:
```bash
for img in hero list archive; do
  curl -sIL "https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/${img}.png" | head -1
done
```
Expected: each returns `HTTP/2 200`.

### Step 6.4: Tag the milestone
```bash
git tag -a m8 -m "M8: README + screenshots + LICENSE + repo metadata"
```

---

## What user must verify after merge

1. Visit https://github.com/Autumn1337/octozine — landing page should show the CN README with hero image
2. Description and topics visible at top of repo
3. Click hero image link → goes to live site
4. Click "5 分钟开始" 步骤里的 GitHub Actions link → works
5. Both READMEs render images correctly (no broken image icons)

If any of these fail, the most likely cause is image URLs (relative vs absolute) — fix is one commit.

---

## Self-Review Notes

- **Spec coverage**: §16 of design doc lists README structure (顶部 GIF / 5 分钟开始 / 它会发现什么 / 配置参考 / 设计文档链接). M8 covers all of these except GIF (using static screenshots instead — pragmatic).
- **Out-of-scope items deferred**: GIF (manual recording, low ROI vs static screenshots), README internationalization beyond zh/en (overkill).
- **Type/link consistency**: All image URLs use absolute `raw.githubusercontent.com` paths (won't break when README is rendered outside GitHub or on a fork). Internal doc links use relative paths.
- **No placeholder scan needed**: All content is final. Provider table reuses content from `docs/setup.md` (DRY: setup.md is the source of truth for setup steps; README links to it).
