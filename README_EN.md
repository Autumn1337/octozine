# Octozine · A weekly folio of GitHub

[中文](./README.md) · [English](./README_EN.md)

> **A folio of GitHub, curated weekly.**
> A self-deployable, AI-augmented, personalized GitHub discovery tool.
> Fork it, then get a weekly GitHub digest tailored to you.

[![demo](https://img.shields.io/badge/demo-live-success?style=flat-square)](https://autumn1337.github.io/octozine/)
[![tests](https://img.shields.io/badge/tests-79%20passing-brightgreen?style=flat-square)](https://github.com/Autumn1337/octozine/actions)
[![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

![hero](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/hero.png)

---

## What is it

Every Monday, a GitHub Action in your fork:

1. Pulls ~150 candidate projects from **GitHub Trending / Search API / Hacker News**
2. Uses an LLM (your choice) to rank them against **your** interest profile, picks top 5
3. Generates a bilingual (zh + en) summary plus a one-line "why this one" reason
4. Deploys a magazine-style GitHub Pages site (like the [demo](https://autumn1337.github.io/octozine/))
5. Optionally pushes to Telegram / Email / RSS

Every fork's output is different — the LLM infers your taste from your starred repos and ranks against that profile.

---

## See it in action

→ **[Live demo · autumn1337.github.io/octozine](https://autumn1337.github.io/octozine/)**

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## Prerequisites

| You need | For |
|---|---|
| A GitHub account | Forking, running Actions, deploying Pages |
| An OpenAI-compatible LLM API key | Ranking + summaries + interest-profile generation |

**Where to get an LLM key?** Pick one:

| Provider | Sign up | Notes |
|---|---|---|
| **DeepSeek** (recommended) | [platform.deepseek.com](https://platform.deepseek.com) | Best price/quality, accessible from China |
| Moonshot (Kimi) | [platform.moonshot.cn](https://platform.moonshot.cn) | China |
| Alibaba Qwen | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | China |
| Zhipu GLM | [open.bigmodel.cn](https://open.bigmodel.cn) | China |
| OpenAI | [platform.openai.com](https://platform.openai.com) | Defaults to `gpt-5.4-mini` |
| Groq | [console.groq.com](https://console.groq.com) | Free tier is enough; very fast |
| Ollama | self-hosted | JSON mode partial — use with care |

Cost: ~6 LLM calls per issue (1 rank + 5 summarize, plus 1 profile gen on first run). Running weekly, DeepSeek costs < ¥5/year, OpenAI < $1/year. Provider pricing changes — verify at sign-up.

---

## 5 minutes to first issue

### Step 1 · Fork

→ [github.com/Autumn1337/octozine/fork](https://github.com/Autumn1337/octozine/fork)

### Step 2 · Edit 2 lines in `config/config.yaml` of your fork

```yaml
github_username: <your GitHub username>     # ← change this. First run pulls your starred to infer your taste

llm:
  provider: deepseek                        # ← whichever provider you got a key for (table above)
  # model: deepseek-v4-pro                  # ← optional. Leave commented to use the provider's default
```

Leave everything else alone. Commit to your fork's main.

> ℹ️ Forks do **not** ship a `config/profile.yaml` (only a `.example`). On first run, octozine generates one from your starred repos and commits it back — you don't need to touch this file manually.

### Step 3 · Add the LLM key as a repo secret

repo Settings → Secrets and variables → Actions → **New repository secret**:

- **Name**: `LLM_API_KEY`
- **Value**: your LLM API key

### Step 4 · Enable GitHub Pages

repo Settings → Pages → **Source**: GitHub Actions

(No need to pick a branch — the workflow uploads its own artifact.)

### Step 5 · Trigger the first run

repo Actions → **Octozine Daily** → **Run workflow** (top-right).

In ~3 minutes you'll see:

- ✅ The Action finishes green (if not, see "Troubleshooting" below)
- 📦 2 new commits in your repo:
  - `data: issue 2026-WXX [skip ci]` ← issue data + auto-generated `profile.yaml` + the flipped-back `regenerate: false`
- 🌐 Your site is live at `https://<your-username>.github.io/<your-repo-name>/`

After that, the workflow runs every Monday 09:00 UTC. To change frequency/timezone: edit `schedule:` in `config/config.yaml`, then `npm install && npm run sync-cron && git push`. See [docs/setup.md](./docs/setup.md).

---

## After the first run: your interest profile

The first run uses an LLM to read your last 100 starred repos, write `config/profile.yaml`, and commit it back to your main branch. It looks like:

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

**This file is what you tell the LLM about your tastes.** Edit it freely — your edits stick across runs. At rank time, the LLM scores each candidate against this profile and writes a short Chinese curator reason ("why this one"), shown on the site.

Want to refresh the profile (e.g., your starred set has shifted)? Set `regenerate: true` in `config/config.yaml`; the next run will rebuild it and flip the flag back to false.

---

## Switch LLM provider and model

### Switching provider

Just change `provider:` in `config/config.yaml`. 7 built-in providers (table below).

### Switching model

Open `config/config.yaml`. The `llm:` block has a pre-written commented `# model:` example for each provider. **Find the line for your provider and remove the leading `#`**:

```yaml
# Before:
  # ── deepseek ── default `deepseek-v4-flash`  ·  stronger: deepseek-v4-pro
  #               docs: https://api-docs.deepseek.com/quick_start/pricing
  # model: deepseek-v4-pro

# After (uncomment the last line):
  # ── deepseek ── default `deepseek-v4-flash`  ·  stronger: deepseek-v4-pro
  #               docs: https://api-docs.deepseek.com/quick_start/pricing
  model: deepseek-v4-pro
```

⚠️ Only **one** `model:` may be active in the `llm:` block — don't uncomment two of them.

Want a different model from the same provider? Just edit the string after `model:`, e.g. `model: deepseek-v4-pro` → `model: deepseek-chat`. See the docs link in the table below for each provider's current model lineup.

### Defaults reference

Every default + a few common alternatives (all verified 2026-05; click docs for the latest list):

| `provider:` | Default model | Common alternatives | Current model list |
|---|---|---|---|
| `openai` | `gpt-5.4-mini` | `gpt-5.4`, `gpt-5.5`, `gpt-4.1-mini` | [docs](https://platform.openai.com/docs/models) |
| `deepseek` | `deepseek-v4-flash` | `deepseek-v4-pro` | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `moonshot` | `moonshot-v1-128k` | `moonshot-v1-32k`, `kimi-k2-thinking` | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | `qwen-max`, `qwen3.6-plus`, `qwen3.6-flash` | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | `glm-4.5-flash` (free), `glm-4.7` | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | `llama-3.3-70b-versatile`, `openai/gpt-oss-20b` | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | any model you've `ollama pull`-ed locally | — |
| `custom` | — | requires `base_url` + `model` | — |

Summary quality is not very model-sensitive — every default above is a "flash / mini" tier and is good enough for octozine's rank + summarize workload. For higher-quality rank reasons or longer bilingual summaries, try the bigger models — cost stays in the cents-per-issue range.

### Providers not in the table (xAI, Together, self-hosted vLLM, …)

```yaml
llm:
  provider: custom
  base_url: https://your-endpoint.example/v1
  model: your-model
```

---

## Push channels (optional)

Out of the box, **only GitHub Pages and RSS** are enabled (`/feed.xml` autogenerated; head includes `<link rel="alternate">`).

If you want to fan-out each issue:

| Channel | Default | How to enable |
|---|---|---|
| **GitHub Pages** | always on | already enabled in the 5-minute flow |
| **RSS / Atom** | always on | subscribe to `https://<you>.github.io/<repo>/feed.xml` |
| **Telegram bot** | off | config `enabled: true` + `TELEGRAM_BOT_TOKEN` secret |
| **Email (SMTP)** | off | config `enabled: true` + `SMTP_HOST/PORT/USER/PASS/FROM` secrets |

Full configuration and secret setup: [docs/setup.md → push channels](./docs/setup.md#optional-push-channels-telegram--email--rss).

Push runs as a **separate Action step after** the Pages deploy, so a misconfigured push channel never blocks site publication.

---

## History archive

Every issue is committed to `data/issues/<slug>.json` and published to an archive page:

![archive](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/archive.png)

Your git history *is* your archive — browse via the site's Archive page or by reading commits directly in your fork.

---

## Troubleshooting

**Q: First run failed with `profile generation: yourname has zero starred repos`**
→ `config.yaml` still has the placeholder `github_username: yourname`. Change it to your real GitHub username.

**Q: Logs say `LLM HTTP 401`**
→ Three possibilities: (a) `LLM_API_KEY` secret not set; (b) the key is wrong; (c) the key doesn't match the `provider:` you set (e.g. an OpenAI key with `provider: deepseek`).

**Q: Logs say `only 1/3 fetchers survived`**
→ Multiple sources failed simultaneously — usually transient network. Re-run. If `search` keeps 403-ing, that's GitHub API anonymous rate limiting (60 req/h); add a `GH_TOKEN` secret (any PAT, no special scopes needed) to raise it to 5000 req/h.

**Q: Action is green but the site is 404 / unstyled**
→ Settings → Pages → Source isn't set to GitHub Actions (likely set to a Branch). Switch it back and re-run the workflow.

**Q: I want to re-run within the same week**
→ History dedup will block with `zero fresh candidates`. Quick fix: delete `data/issues/<this-week>.json` and the matching entries in `data/seen.json`, or temporarily set `history_window: 0` in `config.yaml`.

**Q: I want to bias the profile toward something specific (e.g. Rust only)**
→ Just edit `config/profile.yaml` directly — your edits persist across runs. The LLM reads `themes:` / `languages:` / `exclude_themes:` / `notes:`, all four.

**Q: I want a daily digest instead of weekly**
→ Change `schedule: daily` in `config.yaml`, then locally `npm install && npm run sync-cron`, commit the regenerated `.github/workflows/daily.yml`. The `sync-cron` script translates schedule into a workflow cron expression.

More: [docs/setup.md → Troubleshooting](./docs/setup.md#troubleshooting).

---

## Why not just use existing tools

| Tool | What it does | What Octozine does differently |
|---|---|---|
| `GitHubDaily` | Hand-curated Chinese README list | Fully automated + personalized + forkable |
| `agents-radar` | Tracks a preset list of AI repos | Real trending discovery, no preset list |
| `Horizon` | Aggregates HN / Reddit / Twitter | Focuses on GitHub trending + LLM personalization |

Short version: those tools serve everyone the same content. Octozine **gives every fork a different output**.

---

## Project layout

```
octozine/
├─ src/
│   ├─ fetchers/{trending,search,hn,events}.ts    # 4 data sources
│   ├─ pipeline/{dedup,history,profile,rank,summarize}.ts
│   ├─ llm/                                       # OpenAI-compatible adapter + provider registry
│   ├─ push/{telegram,email,markdown}.ts          # push channels
│   ├─ render/build-issue.ts
│   ├─ index.ts                                   # `npm run pipeline`
│   └─ push.ts                                    # `npm run push`
├─ web/                                           # Astro magazine-style site
├─ config/                                        # your settings (each file < 30 lines)
│   ├─ config.yaml                                # provider / schedule / sources / outputs
│   └─ profile.yaml                               # interest profile (editable / regeneratable)
├─ data/                                          # state (git-tracked)
│   ├─ issues/<slug>.json                         # full issue snapshot
│   └─ seen.json                                  # history dedup { "owner/repo": "issue_slug" }
└─ .github/workflows/daily.yml                    # cron + Pages + push
```

---

## Local development

```bash
git clone https://github.com/<you>/octozine
cd octozine
npm install
npm test                                    # 79 tests, 18 files

# Run pipeline locally to see real output (needs LLM_API_KEY env var)
export LLM_API_KEY="sk-..."
npm run pipeline                            # writes data/issues/<slug>.json

# Local preview of the Astro site
cd web && npm install && npm run dev        # http://localhost:4321/
```

Behind a proxy (China):
```bash
export HTTPS_PROXY="http://127.0.0.1:<your-proxy-port>"
export NODE_USE_ENV_PROXY=1                 # required on Node 24+
```

GitHub Actions runners don't need this.

---

## Design docs

- Full spec: [docs/superpowers/specs/2026-05-06-octozine-design.md](./docs/superpowers/specs/2026-05-06-octozine-design.md)
- Implementation plans: [docs/superpowers/plans/](./docs/superpowers/plans/)
- User setup guide: [docs/setup.md](./docs/setup.md)

---

## License

MIT — use, modify, distribute freely.
