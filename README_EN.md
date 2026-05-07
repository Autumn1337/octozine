<h1 align="center">Octozine</h1>

<p align="center">
  <em>Octozine：Fork your own GitHub curator.</em>
  <br>
  Fork it once. Get a GitHub project zine <strong>tailored to you</strong>.
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
  <a href="#5-minutes-to-first-issue">5-minute setup</a>
  ·
  <a href="./docs/setup.md">Setup</a>
  ·
  <a href="./docs/design.md">Design</a>
</p>

---

## Not Just Trending

GitHub Trending shows everyone the same list. Octozine reads your GitHub signals:

- profile / bio
- public repos you maintain
- recent public activity
- starred repos
- representative README excerpts

Then it discovers projects from GitHub Trending, Search API, Hacker News, and optional Events, ranks them against your profile, and publishes a weekly magazine-style site.

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

Every fork gets different output. The point is not “what is popular today”, but “why this project fits you”.

---

## 5 Minutes To First Issue

Before starting, get an OpenAI-compatible LLM API key. [DeepSeek](https://platform.deepseek.com) is the recommended default, but OpenAI, Qwen, Moonshot, Zhipu, Groq, Ollama, and custom endpoints also work.

All steps below happen on GitHub.com. No local clone required.

### 1. Fork

Click [Fork this repo](https://github.com/Autumn1337/octozine/fork). Everything below happens inside your fork.

### 2. Edit two config lines

Open `config/config.yaml`, click the pencil icon, and change:

```yaml
github_username: yourname
llm:
  provider: deepseek
```

Replace `yourname` with your GitHub username. Change `provider` to whichever provider your key belongs to (see the full table at [LLM Provider](#llm-provider) below). Commit the file directly to main.

### 3. Add the secret

In your fork, open:

`Settings → Secrets and variables → Actions → New repository secret`

- **Name**: `LLM_API_KEY`
- **Secret**: paste your LLM API key

**⚠️ Strongly recommended: add a `GH_TOKEN` secret too** (any GitHub Personal Access Token, no scopes required):

- Without it: GitHub anonymous API limit is **60 req/h**, and one octozine run uses ~30. Two runs back-to-back will hit the wall.
- With it: **5000 req/h**, effectively unlimited.

Grab a token: [github.com/settings/tokens](https://github.com/settings/tokens) → Tokens (classic) → Generate new token → leave all scopes unchecked → copy the `ghp_...` string → add it the same way with name `GH_TOKEN`.

### 4. Enable GitHub Pages

Open:

`Settings → Pages`

- Set **Source** to **GitHub Actions**

Do not choose “Deploy from a branch”. That is the most common cause of 404 or unstyled pages.

### 5. Run once

Open:

`Actions → Octozine Daily → Run workflow`

After 3-5 minutes, a new commit should land on main:

```text
data: issue 2026-W19 [skip ci]
  data/issues/2026-W19.json
  config/profile.yaml
```

Your site will be live at:

```text
https://yourname.github.io/octozine/
```

After that, it runs every Monday at 09:00 UTC. Change the schedule in [docs/setup.md](./docs/setup.md).

---

## What It Publishes

Each issue picks **8 projects by default** out of ~150 candidates (Trending / Search / HN) — tune it via `top_n` in `config/config.yaml` (e.g. `top_n: 12` for breadth, `top_n: 5` for a tight curated feel). Each pick comes with:

- bilingual zh/en summaries
- a Chinese “why this one” reason
- matched profile themes / languages
- source signals, such as Trending + HN
- RSS feed
- optional Telegram / Email push

The core value is not listing projects. It is explaining why they belong in your feed.

---

## Personalization

On first run, Octozine writes `config/profile.yaml`. This is a hand-editable v2 profile:

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

See the full schema in [config/profile.yaml.example](./config/profile.yaml.example).

To give the generator explicit hints, edit `config/config.yaml`:

```yaml
profile:
  regenerate: false
  include: [rust cli, local inference]
  exclude: [crypto, marketing automation]
```

To rebuild the profile, set `regenerate` to `true`. The next run rewrites the profile and flips it back to `false`.

---

## LLM Provider

```yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro
```

| `provider` | Default model | Sign-up | Model list |
|---|---|---|---|
| **`deepseek`** | `deepseek-v4-flash` | [platform.deepseek.com](https://platform.deepseek.com) | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `openai` | `gpt-5.4-mini` | [platform.openai.com](https://platform.openai.com) | [docs](https://platform.openai.com/docs/models) |
| `moonshot` | `moonshot-v1-128k` | [platform.moonshot.cn](https://platform.moonshot.cn) | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | [open.bigmodel.cn](https://open.bigmodel.cn) | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | [console.groq.com](https://console.groq.com) | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | local | - |
| `custom` | - | any OpenAI-compatible endpoint | set `base_url` + `model` |

DeepSeek is the recommended default: cheap, fast enough, and good for summaries. A steady-state issue takes about 9 LLM calls (rank + 8 summarize); first runs or profile rebuilds add 2 more (profile extract + critic).

### Real-world cost estimate (weekly cron, default `top_n: 8`)

| Provider · model | First run (11 calls) | Monthly (4 issues) | Notes |
|---|---|---|---|
| **DeepSeek `v4-flash`** (default) | ≈ ¥0.07 (~$0.01) | ≈ ¥0.3 (~$0.04) | Best price/quality |
| **DeepSeek `v4-pro`** | ≈ ¥0.8 (measured ¥0.6 at `top_n: 5`, 18 min) | ≈ ¥3 (~$0.40) | Higher quality, 5-10× slower |
| **OpenAI `gpt-5.4-mini`** | ≈ $0.07 | ≈ $0.30 | |
| **Qwen `qwen-plus`** | ≈ ¥0.07 | ≈ ¥0.3 | |
| **Zhipu `glm-4.5-air`** | ≈ ¥0.07 | ≈ ¥0.3 | |
| **Groq `llama-3.1-8b-instant`** | free tier usually enough | ≈ $0 | Very fast inference |
| **Ollama** (local) | $0 | $0 | Local GPU; JSON mode partially supported |
| Moonshot 128k context | priced per official rates | — | 128k-context models cost more per token |

**With `v4-flash` you stay under ¥5 (~$0.70) per year.** Running a premium model like `v4-pro` or `gpt-5.5` as default lands around ¥30-40 / $4-6 per year, with first runs taking 20-25 minutes. Cutting `top_n` back to 5 trims both cost and runtime by ~30%.

---

## Subscribe to your zine

By default, octozine deploys to **GitHub Pages** and autogenerates an **RSS feed**:

```text
https://yourname.github.io/octozine/feed.xml
```

Drop that URL into Reeder / Feedly / Inoreader / NetNewsWire / any RSS reader and you'll get the weekly update wherever you already read. **This is the recommended default — zero extra setup; you get it just by following the 5-minute quickstart.**

### Advanced: Telegram / Email push (optional)

If you'd rather have each issue pushed straight to Telegram or your inbox:

- **Telegram bot** — get a token from BotFather, find your chat.id, add 1 secret
- **Email (SMTP)** — recommended providers: [Resend](https://resend.com) (100 free/day) or Gmail App Password; configure SMTP credentials

Step-by-step (BotFather walkthrough / SMTP provider picks / gotchas) lives in [docs/setup.md → push channels](./docs/setup.md#optional-push-channels-telegram--email--rss).

> Push runs as a separate Action step **after** the Pages deploy, so a misconfigured push channel never blocks site publication. It's totally fine to ship with just RSS and add Telegram/Email later when you want to play.

---

## Troubleshooting

**First run fails with `no usable GitHub signals`**

`github_username` may still be `yourname`, or the account has no readable public repos / starred repos / public activity.

**`LLM HTTP 401`**

`LLM_API_KEY` is missing, or it does not match the selected provider.

**`only 1/3 fetchers survived`**

Usually transient network trouble or GitHub’s anonymous API limit. Add `GH_TOKEN` to raise the limit from 60 req/h to 5000 req/h.

**Actions succeeded, but the site is 404 / unstyled**

GitHub Pages Source is not set to **GitHub Actions**.

More troubleshooting: [docs/setup.md](./docs/setup.md).

---

## Keeping your fork up to date

GitHub forks **don't auto-sync from upstream**. When I fix a bug or ship a new feature, your fork stays at whatever version you forked at — you have to pull updates yourself.

### One-click sync

On your fork's main page, click **Sync fork → Update branch**. If you only edited `github_username` + `provider` in `config/config.yaml` and upstream hasn't touched `config.yaml`, GitHub will auto-merge it cleanly.

### Resolving conflicts

The most common case: you customized `config/config.yaml`, and I happened to bump a default in the same file (e.g. `top_n: 5 → 8`). GitHub flags "Conflicts must be resolved" and disables the **Sync fork** button.

Easiest fix is locally:

```bash
git clone https://github.com/yourname/octozine && cd octozine
git remote add upstream https://github.com/Autumn1337/octozine
git fetch upstream
git merge upstream/main
# Edit config/config.yaml: keep YOUR username + provider, accept the new upstream defaults
git add config/config.yaml && git commit
git push
```

### Or skip syncing

Your fork at the version you forked will keep working. Major changes ship as [GitHub Releases](https://github.com/Autumn1337/octozine/releases) — [Watch](https://github.com/Autumn1337/octozine) the repo set to "Releases only" so you get a notification on critical fixes.

---

## Why Not Existing Tools

| Tool | What it does | What Octozine does differently |
|---|---|---|
| `GitHubDaily` | Hand-curated general project list | Fully automated + personalized + forkable |
| `agents-radar` | Tracks a fixed AI repo list | Real discovery, no preset repo list |
| `Horizon` | Aggregates HN / Reddit / Twitter | Focuses on GitHub projects + personal profile ranking |

Those tools serve everyone the same content. Octozine gives every fork a different issue.

---

## Development

```bash
npm install
npm test
npm run typecheck
```

Running the full pipeline requires `LLM_API_KEY`:

```bash
LLM_API_KEY=sk-... npm run pipeline
```

More:

- [docs/setup.md](./docs/setup.md)
- [docs/design.md](./docs/design.md)
- [README.md](./README.md)

## License

MIT
