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
