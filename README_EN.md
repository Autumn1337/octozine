<h1 align="center">Octozine</h1>

<p align="center">
  <em>A folio of GitHub, curated weekly.</em>
  <br>
  A self-deployable, AI-augmented GitHub discovery tool · Fork it, get a weekly digest <strong>tailored to you</strong>
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
  <a href="https://github.com/Autumn1337/octozine/actions"><img src="https://img.shields.io/badge/tests-80%20passing-brightgreen?style=flat-square" alt="tests"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
  <a href="https://autumn1337.github.io/octozine/"><img src="https://img.shields.io/badge/demo-live-success?style=flat-square" alt="demo"></a>
</p>

<p align="center">
  <a href="https://autumn1337.github.io/octozine/">▶&nbsp;Live&nbsp;demo</a>
  &nbsp;·&nbsp;
  <a href="#5-minutes-to-first-issue">⚡&nbsp;Quickstart</a>
  &nbsp;·&nbsp;
  <a href="./docs/design.md">📐&nbsp;Design</a>
  &nbsp;·&nbsp;
  <a href="./docs/setup.md">🔧&nbsp;Setup</a>
</p>

---

## What is it

Every Monday, a GitHub Action in your fork:

1. **Fetches** ~150 candidate projects (GitHub Trending / Search API / Hacker News)
2. **Ranks** with an LLM against your interest profile, picks top 5
3. **Writes** a bilingual (zh + en) summary plus a one-line "why this one" reason
4. **Publishes** a magazine-style GitHub Pages site; optionally pushes to Telegram / Email / RSS

Your interest profile is inferred by the LLM from your starred repos — **every fork's output is different**.

![list](https://raw.githubusercontent.com/Autumn1337/octozine/main/docs/images/list.png)

---

## 5 minutes to first issue

> **Before you start**: grab an LLM API key from [DeepSeek](https://platform.deepseek.com) (or [any other provider](#switch-llm-provider))—it'll be a string like `sk-...` that you'll paste in Step 3.

All 5 steps below are done **on the GitHub web UI**—no git clone needed.

### Step 1 · Fork

Click [👉 Fork this repo 👈](https://github.com/Autumn1337/octozine/fork). After forking, you'll have `https://github.com/<you>/octozine`. **Every step below happens inside your fork.**

### Step 2 · Edit two lines in `config/config.yaml`

In your fork, open `config/config.yaml`, click the ✏️ pencil icon (top-right of the file view) to edit, and change these two values:

```yaml
github_username: <your GitHub username>      # ← used to infer your taste from your starred repos
llm:
  provider: deepseek                          # ← whichever provider you got a key for (deepseek / openai / qwen / ...)
```

Scroll down → **Commit changes** directly to main.

### Step 3 · Add the LLM key as a repo secret

Go to your fork's **Settings → Secrets and variables → Actions → New repository secret**:

- **Name**: `LLM_API_KEY` (must be this exact name)
- **Secret**: paste the key from Step 0
- Click **Add secret**

### Step 4 · Enable GitHub Pages

Go to **Settings → Pages**:

- **Source**: select **GitHub Actions** from the dropdown
- ⚠️ Do NOT pick "Deploy from a branch"—this is the most common gotcha; choosing wrong leaves your site 404'ing

No need to pick a branch—the workflow uploads its own artifact.

### Step 5 · Trigger the first run

Go to the **Actions** tab → pick **Octozine Daily** in the left sidebar → click the blue **Run workflow** button (top-right) → click **Run workflow** again to confirm.

---

### 🎉 What success looks like

In 3-4 minutes, the Action finishes and **a new commit lands on your main branch**:

```
data: issue 2026-WXX [skip ci]
   - data/issues/<slug>.json   this week's generated content
   - config/profile.yaml       LLM-inferred profile from your starred repos
```

Then **your site is live at** `https://<your-username>.github.io/<repo-name>/`.

After this, the workflow runs every Monday at 09:00 UTC (change frequency/timezone in [docs/setup.md](./docs/setup.md)).

**Action failed?** → See the 4 highest-frequency fixes in [Troubleshooting](#troubleshooting) below, or the full [docs/setup.md](./docs/setup.md).

---

## Personalization: your interest profile

The LLM reads your last 100 starred repos and writes `config/profile.yaml`, committing it back to main:

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

At rank time, the LLM scores each candidate against this profile. **Edit the file freely** — your edits stick across runs.
Want to refresh the profile? Set `regenerate: true` in `config.yaml`; the next run rebuilds it and flips the flag back.

---

## Switch LLM provider

```yaml
# config/config.yaml
llm:
  provider: deepseek
  # model: deepseek-v4-pro    # ← optional; config.yaml has a ready-to-uncomment example for each provider
```

| `provider:` | Default model | Sign-up | Current model list |
|---|---|---|---|
| **`deepseek`** ⭐ | `deepseek-v4-flash` | [platform.deepseek.com](https://platform.deepseek.com) | [docs](https://api-docs.deepseek.com/quick_start/pricing) |
| `openai` | `gpt-5.4-mini` | [platform.openai.com](https://platform.openai.com) | [docs](https://platform.openai.com/docs/models) |
| `moonshot` | `moonshot-v1-128k` | [platform.moonshot.cn](https://platform.moonshot.cn) | [docs](https://platform.kimi.com/docs/api/chat) |
| `qwen` | `qwen-plus` | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) | [docs](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `zhipu` | `glm-4.5-air` | [open.bigmodel.cn](https://open.bigmodel.cn) | [docs](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) |
| `groq` | `llama-3.1-8b-instant` | [console.groq.com](https://console.groq.com) | [docs](https://console.groq.com/docs/models) |
| `ollama` | `llama3.1` | local | — |
| `custom` | — | any OpenAI-compatible endpoint; specify `base_url` + `model` | — |

⭐ DeepSeek is best price/quality and accessible from China — recommended default. Summary quality is not very model-sensitive, so the defaults are good enough.

**Cost**: ~6 LLM calls per issue. Running weekly, DeepSeek < ¥5/year, OpenAI < $1/year.

**Change model**: open `config/config.yaml` — every provider has a pre-written commented `# model:` example in the `llm:` block. Uncomment the line for your provider (only one allowed at a time).

---

## Push channels

Out of the box, **only GitHub Pages + RSS** is enabled (`/feed.xml` autogenerated).

| Channel | Default | How to enable |
|---|---|---|
| GitHub Pages + RSS | always on | already enabled in the 5-minute flow |
| Telegram bot | off | config `enabled: true` + `TELEGRAM_BOT_TOKEN` secret |
| Email (SMTP) | off | config `enabled: true` + `SMTP_HOST/PORT/USER/PASS/FROM` secrets |

Full setup: [setup.md → push channels](./docs/setup.md#optional-push-channels-telegram--email--rss). Push runs as a separate Action step **after** the Pages deploy, so a misconfigured push channel never blocks site publication.

---

## Troubleshooting

**First run fails with `zero starred repos`** → `github_username` in `config.yaml` is still the placeholder `yourname`.

**`LLM HTTP 401`** → `LLM_API_KEY` secret not set, or the key doesn't match the `provider:` you chose.

**`only 1/3 fetchers survived`** → transient network; or GitHub API anonymous rate limit (60 req/h). Add a `GH_TOKEN` secret to lift it to 5000 req/h.

**Action green but site 404 / unstyled** → Settings → Pages → Source isn't set to GitHub Actions.

More: [setup.md → Troubleshooting](./docs/setup.md#troubleshooting).

---

## Why not just use existing tools

| Tool | What it does | What Octozine does differently |
|---|---|---|
| `GitHubDaily` | Hand-curated Chinese README list | Fully automated + personalized + forkable |
| `agents-radar` | Tracks a preset list of AI repos | Real trending discovery, no preset list |
| `Horizon` | Aggregates HN / Reddit / Twitter | Focuses on GitHub trending + LLM personalization |

Those tools serve everyone the same content. Octozine **gives every fork a different output**.

---

## More

- **Design & architecture** → [docs/design.md](./docs/design.md) (19 sections covering data sources, LLM adapter, personalization, error handling, implementation order, decision log)
- **Detailed setup** → [docs/setup.md](./docs/setup.md) (full troubleshooting + GH_TOKEN + push channel secrets)
- **Local development** → `npm install && npm test`; running pipeline needs `LLM_API_KEY` env

## License

MIT
