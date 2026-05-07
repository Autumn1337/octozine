# Octozine — Setup

After you fork this repo, do these 4 things and your weekly issues start publishing automatically.

## Prerequisites

- A fork of `Autumn1337/octozine` (or the original repo) under your GitHub account
- An OpenAI-compatible LLM API key (DeepSeek, OpenAI, Moonshot, Qwen, Ollama via cloudflared, etc.)

## 1. Configure your fork

Edit `config/config.yaml`:

- `github_username` — set to your GitHub username
- `llm.provider` — pick a built-in provider name (see table below) or `custom`
- `llm.model` — *(optional)* override the provider's default model
- `sources.trending.langs` — the languages you want to follow
- `schedule` — `weekly` (default), `daily`, or a custom cron expression

Optionally edit `config/profile.yaml` to describe your interests (themes, languages, exclusions).

> **Heads up:** if `config/profile.yaml` is missing on first run, octozine will auto-generate it from your last 100 starred repos and commit it back. To regenerate later (e.g., after your tastes shift), set `profile.regenerate: true` in `config/config.yaml`; the next run will rewrite the profile and flip the flag back.

If you change `schedule`, run locally:
```bash
npm install
npm run sync-cron
git add .github/workflows/daily.yml
git commit -m "chore: sync workflow cron"
git push
```

### Built-in providers

| `provider:` | base_url | default model | notes |
|---|---|---|---|
| `openai` | `https://api.openai.com/v1` | `gpt-5.4-mini` | |
| `deepseek` | `https://api.deepseek.com` | `deepseek-v4-flash` | cheap and fast; use `model: deepseek-v4-pro` for higher quality |
| `moonshot` | `https://api.moonshot.cn/v1` | `moonshot-v1-128k` | Kimi (China) |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | Alibaba DashScope (China) |
| `zhipu` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5-air` | Zhipu / GLM (China); `glm-4.5` itself is being deprecated |
| `groq` | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` | very fast inference |
| `ollama` | `http://localhost:11434/v1` | `llama3.1` | local; JSON mode is best-effort |

For anything else (xAI, Together, self-hosted vLLM, etc.) use:

```yaml
llm:
  provider: custom
  base_url: https://your-endpoint.example/v1
  model: your-model
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

## Optional: push channels (Telegram / Email / RSS)

Each channel is independent — enable any combination, or none.

### RSS

Always-on. The site exposes `/feed.xml` (Atom) and links to it via `<link rel="alternate">` from every page. Add the URL to your RSS reader.

### Telegram

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → save the token.
2. Add the bot to a chat (DM or group) and send any message; then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the `chat.id` (e.g. `123456789` for DMs, `-100…` for groups).
3. In `config/config.yaml`:
   ```yaml
   outputs:
     telegram:
       enabled: true
       chat_id: "<the id from step 2>"
   ```
4. Add a repo secret `TELEGRAM_BOT_TOKEN` = the token from step 1.

### Email (SMTP)

1. Pick an SMTP provider (Gmail App Password, Resend, SendGrid, your own server).
2. In `config/config.yaml`:
   ```yaml
   outputs:
     email:
       enabled: true
       to: "you@example.com"
   ```
3. Add these repo secrets:
   - `SMTP_HOST` (e.g. `smtp.gmail.com`)
   - `SMTP_PORT` (e.g. `465` for TLS, `587` for STARTTLS)
   - `SMTP_USER` (e.g. `you@gmail.com`)
   - `SMTP_PASS` (the password / app-specific password)
   - `SMTP_FROM` (the From: header; usually same as SMTP_USER)

Push runs as a separate workflow step **after** the site has deployed, so a push misconfiguration never blocks publication. The step turns red in the Actions UI when push fails so you notice; the issue still lands on Pages.

## Optional: `GH_TOKEN` secret

The `hn` and `events` sources call the GitHub REST API. Without auth you have a 60 req/h budget per IP; with a token, 5000 req/h.

1. Create a fine-grained PAT at https://github.com/settings/tokens
   - For `hn` enrichment: no scopes needed (`public_repo` read is automatic).
   - For `events`: also grant `read:user` (lets the workflow read your `following` list).
2. Add a repo secret named `GH_TOKEN` with the token value.
3. The workflow already passes it through; nothing else to change.

If you don't enable `events` and don't hit rate limits on `hn`, you can skip this entirely.

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
