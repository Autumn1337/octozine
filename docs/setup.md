# Octozine — Setup

After you fork this repo, do these 4 things and your weekly issues start publishing automatically.

## Prerequisites

- A fork of `Autumn1337/octozine` (or the original repo) under your GitHub account
- An OpenAI-compatible LLM API key (DeepSeek, OpenAI, Moonshot, Qwen, Ollama via cloudflared, etc.)

## 1. Configure your fork

Edit `config/config.yaml`:

- `github_username` — set to your GitHub username
- `llm.base_url` — your LLM provider's endpoint
- `llm.model` — the model name (e.g. `deepseek-v4-pro`)
- `sources.trending.langs` — the languages you want to follow
- `schedule` — `weekly` (default), `daily`, or a custom cron expression

Optionally edit `config/profile.yaml` to describe your interests (themes, languages, exclusions).

If you change `schedule`, run locally:
```bash
npm install
npm run sync-cron
git add .github/workflows/daily.yml
git commit -m "chore: sync workflow cron"
git push
```

## 2. Add your LLM API key as a repo secret

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

- Name: `LLM_API_KEY`
- Value: your API key

## 3. Enable GitHub Pages

GitHub repo → **Settings** → **Pages**:

- **Source**: GitHub Actions

(No need to pick a branch — the workflow uploads its own artifact.)

## 4. Trigger the first run

GitHub repo → **Actions** → **Octozine Daily** → **Run workflow**.

After ~3 minutes:
- The workflow finishes green
- A new commit `data: issue YYYY-WNN [skip ci]` appears on your default branch
- Your site is live at `https://<your-username>.github.io/<repo-name>/`

From then on, the workflow runs on the schedule you set.

## Troubleshooting

- **Workflow fails immediately with "LLM_API_KEY not set"** — Step 2 not done.
- **Workflow fails on "trending fetch failed"** — GitHub trending occasionally returns 5xx; retry by re-running the workflow.
- **Pages 404 after deploy** — wait a minute; first deploy can take 60s for DNS to propagate. Otherwise check Settings → Pages source is "GitHub Actions".
- **No new commit appears** — the workflow only commits when `data/` actually changed; if the LLM produced the same issue (rare), no commit.

## Local development

```bash
npm install
npm run pipeline           # generate an issue locally (needs LLM_API_KEY env var)
cd web && npm install
npm run dev                # local preview at http://localhost:4321/
```

## Behind the great firewall (China)

If `github.com/trending` times out from your machine, set proxy env vars before `npm run pipeline`:
```bash
export HTTPS_PROXY="http://127.0.0.1:<your-proxy-port>"
export NODE_USE_ENV_PROXY=1   # required: Node 24+ does not auto-respect proxy env vars
npm run pipeline
```

GitHub Actions runners do not need this.
