<h1 align="center">Octozine</h1>

<p align="center">
  <em>Octozine：Fork your own GitHub curator.</em>
  <br>
  Not another trending list — fork your own GitHub curator.
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
  <a href="#5-minutes-to-first-issue">Quickstart</a>
  ·
  <a href="./docs/setup.md">Setup</a>
  ·
  <a href="./docs/design.md">Design</a>
</p>

---

## What it solves

GitHub Trending tells you what everyone is looking at.
Octozine tells you **which projects are worth your time, and why**.

It's not a generic newsletter, and it's not a hand-curated weekly.
It's a **personal GitHub discovery pipeline you can fork**.

Every Monday, a GitHub Action in your fork runs and produces an issue made for you alone.

---

## How it works

```text
Your GitHub signals
profile · owned repos · activity · stars · README excerpts
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

Each issue picks **8 projects by default** out of ~150 candidates (tunable via `top_n` in `config.yaml`).
Every project comes with:

- bilingual zh/en summaries
- a one-line "why this one" reason in Chinese
- which themes / languages from your profile this match hits
- the source signals (Trending + HN, etc.)

---

## Every fork is different

The same candidate pool produces a completely different zine for different profiles:

| Profile | Likely surfaces |
|---|---|
| AI infra engineer | inference engines · evals · vector DBs · agent runtimes |
| Frontend tool author | build tools · UI libraries · DX · design systems |
| Rust / CLI hacker | terminal UI · systems tools · performance libraries |
| Indie hacker | micro-SaaS tools · single-file / minimalist projects · self-hostable components |

The point isn't to replay the trending list.
It's to **filter public trends into a personal recommendation**.

---

## 5 minutes to first issue

You need:

- A GitHub account
- An OpenAI-compatible LLM API key ([DeepSeek](https://platform.deepseek.com) recommended — accessible from China + < ¥5/yr at weekly cron)
- **Strongly recommended**: a GitHub Personal Access Token as a `GH_TOKEN` secret — avoids the 60 req/h anonymous GitHub API limit (two back-to-back runs hit the wall)

All steps below happen on GitHub.com. No local clone required.

### 1. Fork

Click [Fork this repo](https://github.com/Autumn1337/octozine/fork).
Everything below happens inside your fork.

### 2. Edit two config lines

Open `config/config.yaml`, click the pencil icon to edit:

```yaml
github_username: yourname
llm:
  provider: deepseek
```

Replace `yourname` with your GitHub username, and set `provider` to whichever provider your key belongs to.
Commit directly to main.

### 3. Add secrets

In your fork: `Settings → Secrets and variables → Actions → New repository secret`. Add:

- **`LLM_API_KEY`** — your LLM key
- **`GH_TOKEN`** (strongly recommended) — any GitHub Personal Access Token ([github.com/settings/tokens](https://github.com/settings/tokens), classic, no scopes required)

### 4. Enable Pages

`Settings → Pages` → set **Source** to **GitHub Actions**.

> ⚠️ Don't pick "Deploy from a branch" — your site will 404 or be unstyled.

### 5. Trigger the first run

`Actions → Octozine Daily → Run workflow`.

In 3-5 minutes you'll see:

- A new commit on main: `data: issue 2026-WXX [skip ci]`
- Your site live at `https://yourname.github.io/octozine/`
- The workflow runs every Monday 09:00 UTC after that (change the schedule via [docs/setup.md](./docs/setup.md))

If something breaks, see [Troubleshooting](#troubleshooting) below.

---

## Personalization

On the first run, Octozine writes `config/profile.yaml` and commits it back to main.
This is a hand-editable v2 profile:

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

Full schema: [config/profile.yaml.example](./config/profile.yaml.example).

To give the generator explicit hints, edit `config/config.yaml`:

```yaml
profile:
  regenerate: false
  include: [rust cli, local inference]
  exclude: [crypto, marketing automation]
```

To rebuild the profile from scratch, set `regenerate: true`. The next run rewrites it and flips the flag back.

---

## LLM Provider

```yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro    # optional; config.yaml has commented examples for each provider
```

**Recommended default**: DeepSeek `deepseek-v4-flash` — best price/quality, accessible from China, < ¥5/yr.

**Compatible**: OpenAI · Qwen · Moonshot · Zhipu · Groq · Ollama · any OpenAI-compatible endpoint (`provider: custom`).

Full model list + per-provider cost estimates → [docs/setup.md → Built-in providers](./docs/setup.md#built-in-providers).

---

## Subscribe to your zine

By default, Octozine deploys to **GitHub Pages** and autogenerates an **RSS feed**:

```text
https://yourname.github.io/octozine/feed.xml
```

Drop this URL into Reeder / Feedly / Inoreader / NetNewsWire / any RSS reader and you'll get the weekly update wherever you already read.
**This is the recommended default — zero extra setup; you get it just by following the 5-minute quickstart.**

### Advanced: Telegram / Email push (optional)

If you'd rather have each issue pushed straight to Telegram or your inbox:

- **Telegram bot** — get a token from BotFather, add 1 secret
- **Email (SMTP)** — recommended providers: [Resend](https://resend.com) (100 free/day) or Gmail App Password

Step-by-step in [docs/setup.md → push channels](./docs/setup.md#optional-push-channels-telegram--email--rss).

> Push runs as a separate Action step **after** the Pages deploy, so a misconfigured channel never blocks site publication.
> Ship with just RSS, add Telegram/Email later when you want to play.

---

## Who it's for / not for

**For**:

- People who scroll GitHub Trending but find the noise unbearable
- Folks who'd like to maintain a personal tech weekly without hand-curating
- Open-source authors, technical bloggers, indie devs, AI / infra / devtool engineers
- Anyone who wants a **SaaS-free** personal discovery pipeline

**Not for**:

- People who want a real-time news feed (Octozine is weekly, not a timeline)
- People who want hand-edited deep commentary
- People unwilling to configure an LLM API key
- GitHub accounts with very little public activity (the profile won't have enough signal)

---

## How it differs from existing tools

| Type | Examples | Best for | Where Octozine sits |
|---|---|---|---|
| Public leaderboards | GitHub Trending · OSSInsight · Trendshift | Seeing global hotness | **Filters global trends into a personal feed** |
| Developer info streams | daily.dev · Folo | Continuous tech content consumption | **Not a stream — only a weekly zine** |
| Hand-curated weeklies | GitHubDaily · open-source weeklies | Editor's picks | **Automated, forkable, personalized** |
| AI radars | Horizon · similar aggregators | Multi-source monitoring | **Focused on GitHub project discovery** |

Octozine doesn't try to replace those tools.
It's more like a **self-hosted personal GitHub curator**.

---

## Troubleshooting

**First run fails with `no usable GitHub signals`**

`github_username` is probably still `yourname`, or the account has no public repos / starred / activity.

**`LLM HTTP 401`**

`LLM_API_KEY` is missing, or it doesn't match the `provider` you chose.

**`only 1/3 fetchers survived`**

Usually transient network or GitHub anonymous API limit. Add `GH_TOKEN` to lift it from 60 → 5000 req/h.

**Action succeeds but the page 404s / has no styling**

Pages Source isn't set to **GitHub Actions**.

More: [docs/setup.md](./docs/setup.md).

---

## Keeping your fork up to date

GitHub forks **don't auto-sync from upstream**.
When I fix a bug or ship a new feature, your fork stays at whatever version you forked at — you have to pull updates yourself.

### One-click sync

On your fork's main page, click **Sync fork → Update branch**.
If you only edited `github_username` + `provider` in `config/config.yaml` and upstream hasn't touched `config.yaml`, GitHub will auto-merge cleanly.

### Resolving conflicts

The most common case: you customized `config/config.yaml`, and I happened to bump a default in the same file.
GitHub flags "Conflicts must be resolved" and disables the **Sync fork** button.

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

Your fork at the version you forked will keep working.
Major changes ship as [GitHub Releases](https://github.com/Autumn1337/octozine/releases) — [Watch](https://github.com/Autumn1337/octozine) the repo set to "Releases only" so you get a notification on critical fixes.

---

## Development

```bash
npm install
npm test
npm run typecheck
```

Running the full pipeline needs `LLM_API_KEY`:

```bash
LLM_API_KEY=sk-... npm run pipeline
```

More:

- [docs/setup.md](./docs/setup.md)
- [docs/design.md](./docs/design.md)
- [README.md](./README.md)

## License

MIT
