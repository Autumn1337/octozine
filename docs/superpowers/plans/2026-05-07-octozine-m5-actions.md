# Octozine M5 Implementation Plan: GitHub Actions + Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Octozine **fork-and-go** — once a user forks the repo and adds an LLM API key as a secret, GitHub Actions runs the pipeline on schedule, commits the new issue back to git, and deploys the Astro site to GitHub Pages. Zero local setup required.

**Architecture:** A single `.github/workflows/daily.yml` workflow with two triggers (cron + manual `workflow_dispatch`). The job runs `npm install`, `npm run pipeline`, `cd web && npm install && npm run build`, uploads the static site as a Pages artifact, deploys it, and commits the new `data/issues/*.json` back to the branch. A `scripts/sync-cron.mjs` script reads `config.yaml`'s `schedule` field and updates the cron expression in the workflow yml — runs locally when the user changes their schedule.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`), Node.js 20, optional `actionlint` for local validation.

**Reference:** See `docs/superpowers/specs/2026-05-06-octozine-design.md` §15 for design.

---

## Scope of this plan

**In scope (M5)**:
- `.github/workflows/daily.yml` — cron + manual triggers, full pipeline → Pages deploy → commit-back
- `scripts/sync-cron.mjs` — reads `config.schedule`, rewrites the cron line in the workflow
- `npm run sync-cron` script in `package.json`
- User setup documentation: `docs/setup.md` covering fork → Pages enable → secret → first run

**Out of scope** (later plans):
- Multi-source fetchers: search/hn/events (M4)
- Profile auto-generation from starred repos (M6)
- Telegram/email/RSS push (M7)
- Full README + demo GIF (M8 — `docs/setup.md` here is the minimum technical doc; promotional README comes later)

**Key constraints**:
- The user owns the GitHub repo (e.g., `Autumn1337/octozine`). The workflow uses the built-in `GITHUB_TOKEN` for both Pages deploy and commit-back, no extra PAT.
- `LLM_API_KEY` is a required user-set secret. Workflow fails fast with a readable message if missing.
- Default cron: `0 9 * * 1` (weekly Monday 09:00 UTC = ~17:00 Asia/Shanghai). User can change via `config.schedule` + `npm run sync-cron`.

---

## File map

| File | Purpose |
|---|---|
| `.github/workflows/daily.yml` | The workflow (cron + manual trigger, single job) |
| `scripts/sync-cron.mjs` | Reads `config.yaml`, writes back the cron line in `daily.yml` |
| `tests/scripts/sync-cron.test.ts` | Unit tests for the cron sync logic |
| `package.json` | Add `sync-cron` script |
| `docs/setup.md` | User-facing setup checklist (fork → Pages → secret → run) |
| `tests/fixtures/sync-cron-input.yml` | Sample workflow yaml used as test fixture |

---

## Conventions

- TDD strictly for `sync-cron.mjs` (logic). The workflow yml has no unit test — actionlint + manual workflow_dispatch is the validation.
- Commit messages: Conventional Commits.
- Imports: ESM with `.js` extension on relative imports.
- All commands run from `/mnt/e/Projects/githubdaily`.

---

## Task 0: Scaffold directories + dependency

**Files:** Create `.github/workflows/`, `scripts/`, `tests/scripts/`, `tests/fixtures/`. No code yet.

- [ ] **Step 0.1: Create the directories**
```bash
mkdir -p .github/workflows scripts tests/scripts tests/fixtures
```

- [ ] **Step 0.2: Verify directories exist (no commit yet — empty dirs are not tracked)**
```bash
ls -d .github/workflows scripts tests/scripts tests/fixtures
```

(Skip commit; `tests/fixtures/` already has files from M3, others get committed as part of later tasks.)

---

## Task 1: `scripts/sync-cron.mjs` + tests

**Files:**
- Create: `scripts/sync-cron.mjs`, `tests/scripts/sync-cron.test.ts`, `tests/fixtures/sync-cron-input.yml`

The script reads `config/config.yaml`, extracts `schedule`, converts to a cron expression, and rewrites the `cron:` line in `.github/workflows/daily.yml`. Aliases:
- `weekly` → `0 9 * * 1`
- `daily` → `0 9 * * *`
- Anything starting with a digit, `*`, or `@` → treated as a literal cron expression (passed through verbatim)

Pure function `scheduleToCron(s)` is the core logic and what tests verify. The file write is a thin wrapper.

### Step 1.1: Write the test fixture

`tests/fixtures/sync-cron-input.yml`:
```yaml
name: Octozine
on:
  schedule:
    - cron: "0 9 * * 1"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  daily:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
```

### Step 1.2: Write the failing test

`tests/scripts/sync-cron.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { scheduleToCron, applyCronToWorkflow } from "../../scripts/sync-cron.mjs";

describe("scheduleToCron", () => {
  it("maps weekly", () => {
    expect(scheduleToCron("weekly")).toBe("0 9 * * 1");
  });
  it("maps daily", () => {
    expect(scheduleToCron("daily")).toBe("0 9 * * *");
  });
  it("passes through a literal cron", () => {
    expect(scheduleToCron("30 6 * * 5")).toBe("30 6 * * 5");
  });
  it("passes through @-style", () => {
    expect(scheduleToCron("@hourly")).toBe("@hourly");
  });
  it("throws on unknown alias", () => {
    expect(() => scheduleToCron("yearly")).toThrow();
  });
});

describe("applyCronToWorkflow", () => {
  it("rewrites only the cron line, preserves the rest", async () => {
    const input = await readFile(new URL("../fixtures/sync-cron-input.yml", import.meta.url), "utf8");
    const out = applyCronToWorkflow(input, "30 6 * * 5");
    expect(out).toContain('- cron: "30 6 * * 5"');
    expect(out).not.toContain('- cron: "0 9 * * 1"');
    expect(out).toContain("workflow_dispatch:");
    expect(out).toContain("jobs:");
  });

  it("throws if no cron line found", () => {
    expect(() => applyCronToWorkflow("name: x\non:\n  workflow_dispatch:\n", "0 9 * * 1")).toThrow();
  });
});
```

### Step 1.3: Run test, expect FAIL
```bash
npm test -- tests/scripts/sync-cron.test.ts
```

### Step 1.4: Implement `scripts/sync-cron.mjs`

```js
#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import * as path from "node:path";

const ALIASES = {
  weekly: "0 9 * * 1",
  daily: "0 9 * * *",
};

export function scheduleToCron(s) {
  if (typeof s !== "string" || s.length === 0) {
    throw new Error(`scheduleToCron: invalid schedule ${JSON.stringify(s)}`);
  }
  if (s in ALIASES) return ALIASES[s];
  // literal cron: starts with digit, *, or @
  if (/^[\d*@]/.test(s.trim())) return s.trim();
  throw new Error(`scheduleToCron: unknown schedule alias "${s}". Use "weekly", "daily", or a cron expression.`);
}

const CRON_LINE_RE = /^(\s*-\s*cron:\s*)(?:"([^"]*)"|'([^']*)'|(\S.*))(\s*)$/m;

export function applyCronToWorkflow(yml, cron) {
  if (!CRON_LINE_RE.test(yml)) {
    throw new Error("applyCronToWorkflow: no `- cron:` line found in workflow yml");
  }
  return yml.replace(CRON_LINE_RE, (_m, prefix, _q1, _q2, _bare, trailing) => {
    return `${prefix}"${cron}"${trailing}`;
  });
}

async function main() {
  const root = process.cwd();
  const configPath = path.join(root, "config/config.yaml");
  const workflowPath = path.join(root, ".github/workflows/daily.yml");
  const cfgText = await readFile(configPath, "utf8");
  const cfg = yaml.load(cfgText);
  const schedule = cfg && typeof cfg === "object" && "schedule" in cfg ? cfg.schedule : null;
  if (!schedule) {
    console.error("config/config.yaml has no `schedule` field");
    process.exit(1);
  }
  const cron = scheduleToCron(schedule);
  const ymlText = await readFile(workflowPath, "utf8");
  const updated = applyCronToWorkflow(ymlText, cron);
  if (updated === ymlText) {
    console.log(`cron already up to date: "${cron}"`);
    return;
  }
  await writeFile(workflowPath, updated, "utf8");
  console.log(`updated ${path.relative(root, workflowPath)} cron → "${cron}"`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

### Step 1.5: Re-run test, expect PASS
```bash
npm test -- tests/scripts/sync-cron.test.ts
```

### Step 1.6: Commit
```bash
git add scripts/sync-cron.mjs tests/scripts/sync-cron.test.ts tests/fixtures/sync-cron-input.yml
git commit -m "feat(scripts): sync-cron — translate config.schedule to workflow cron"
```

---

## Task 2: `.github/workflows/daily.yml`

**Files:** Create `.github/workflows/daily.yml`.

This is the heart of M5: the workflow that runs the pipeline, builds the site, deploys to Pages, and commits new issue data back.

**Design choices**:
- Single job (`run`) — sequential is simpler and the whole pipeline takes < 5 min
- `permissions: { contents: write, pages: write, id-token: write }` — minimum needed
- `concurrency: pages` — prevents overlapping deploys
- LLM_API_KEY required: workflow fails with a clear message if absent (caught in `npm run pipeline` already, but we add an explicit early check)
- Commit-back uses bot identity `github-actions[bot]`; only commits if `data/` actually changed
- `permissions.contents: write` on a fork doesn't trigger another workflow run on push (GitHub built-in protection)

### Step 2.1: Write `.github/workflows/daily.yml`

```yaml
name: Octozine Daily

on:
  schedule:
    - cron: "0 9 * * 1"          # weekly Monday 09:00 UTC; change via `npm run sync-cron`
  workflow_dispatch:

permissions:
  contents: write                # commit data/ back
  pages: write                   # deploy to GitHub Pages
  id-token: write                # required by deploy-pages

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0          # need history so commit-back rebases cleanly

      - name: Verify LLM_API_KEY
        env:
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
        run: |
          if [ -z "$LLM_API_KEY" ]; then
            echo "::error::LLM_API_KEY secret is not set. Add it under repo Settings → Secrets and variables → Actions."
            exit 1
          fi

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: |
            package-lock.json
            web/package-lock.json

      - name: Install root deps
        run: npm ci

      - name: Run pipeline
        env:
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
        run: npm run pipeline

      - name: Install web deps
        working-directory: web
        run: npm ci

      - name: Build site
        working-directory: web
        run: npm run build

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./web/dist

      - name: Deploy to Pages
        id: deploy
        uses: actions/deploy-pages@v4

      - name: Commit new issue data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- data/; then
            echo "no data/ changes to commit"
            exit 0
          fi
          git add data/
          slug=$(git diff --staged --name-only -- data/issues/ | grep -oE '[0-9]{4}-W[0-9]{2}' | head -1)
          slug=${slug:-untitled}
          git commit -m "data: issue ${slug} [skip ci]"
          git push
```

### Step 2.2: Validate the yaml syntax

```bash
node -e "import('js-yaml').then(({default: y}) => { y.load(require('node:fs').readFileSync('.github/workflows/daily.yml', 'utf8')); console.log('yaml ok'); })"
```
Expected: `yaml ok`.

### Step 2.3: Commit
```bash
git add .github/workflows/daily.yml
git commit -m "feat(ci): daily workflow — pipeline, build, deploy-pages, commit data back"
```

---

## Task 3: Hook `sync-cron` into `package.json`

**Files:** Modify `package.json`.

### Step 3.1: Add `sync-cron` script

Read current `scripts` block:
```json
"scripts": {
  "pipeline": "node --import tsx/esm src/index.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

Replace with:
```json
"scripts": {
  "pipeline": "node --import tsx/esm src/index.ts",
  "sync-cron": "node scripts/sync-cron.mjs",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

### Step 3.2: Verify script runs (it will say cron up-to-date since default workflow is already `0 9 * * 1` and config default is `weekly` → same cron)

```bash
npm run sync-cron
```
Expected: prints `cron already up to date: "0 9 * * 1"`.

### Step 3.3: Verify a roundtrip works

Temporarily change `config/config.yaml` `schedule:` to `daily`, then:
```bash
npm run sync-cron
grep "cron:" .github/workflows/daily.yml
git checkout config/config.yaml .github/workflows/daily.yml
```
Expected: cron line shows `- cron: "0 9 * * *"`. Then revert both files.

### Step 3.4: Commit
```bash
git add package.json
git commit -m "chore(scripts): add npm run sync-cron"
```

---

## Task 4: User setup documentation `docs/setup.md`

**Files:** Create `docs/setup.md`.

**Important**: This is the technical setup doc, NOT the promotional README. M8 will produce the README. Keep this doc factual and procedural.

### Step 4.1: Write `docs/setup.md`

```markdown
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
```

### Step 4.2: Commit
```bash
git add docs/setup.md
git commit -m "docs: user setup guide for fork → Pages → secret → first run"
```

---

## Task 5: Final verification + tag

- [ ] **Step 5.1: Full test suite**
```bash
npm test
```
Expected: 9 test files (M3's 8 + new `tests/scripts/sync-cron.test.ts`), 26 tests (M3's 20 + 6 new), all green.

- [ ] **Step 5.2: Typecheck**
```bash
npm run typecheck
```

- [ ] **Step 5.3: Verify workflow yaml is valid**
```bash
node -e "import('js-yaml').then(({default: y}) => { y.load(require('node:fs').readFileSync('.github/workflows/daily.yml', 'utf8')); console.log('yaml ok'); })"
```

- [ ] **Step 5.4: Verify sync-cron is a no-op now**
```bash
npm run sync-cron
```
Expected: `cron already up to date: "0 9 * * 1"`.

- [ ] **Step 5.5: Confirm web build still works**
```bash
cd web && npm run build && cd ..
```

- [ ] **Step 5.6: Tag the milestone**
```bash
git tag -a m5 -m "M5: GitHub Actions + Pages auto-deploy"
```

---

## What user must do AFTER M5 merges (cannot be automated)

These steps require GitHub UI — they are listed in `docs/setup.md` but worth flagging here:

1. Create the GitHub repo (e.g. `Autumn1337/octozine`) and push `main`
2. Add `LLM_API_KEY` as a repo secret
3. Enable Pages → Source: GitHub Actions
4. Run the workflow once manually to verify the loop closes

If any of these are missed, the workflow fails clearly (we already added the LLM_API_KEY check); Pages settings missing produces a deploy-pages error in the workflow log.

---

## Self-Review Notes

- **Spec coverage**: §15 of design doc covers M5 in detail. This plan implements all of: cron + dispatch trigger, secrets, npm-ci-based install, pipeline run, web build, deploy-pages, commit-back. Adds the `sync-cron` script (mentioned in spec as a separate npm script), and the user-facing setup doc.
- **Out-of-scope items deferred**: Pre-commit hooks for cron sync (deferred — `npm run sync-cron` is a manual call); workflow self-update (deferred). Both are valid quality-of-life additions but YAGNI for M5.
- **Type consistency**: New code is plain ESM JS (`scripts/sync-cron.mjs`) — no TypeScript types to align. Tests are TypeScript and import the .mjs script directly (vitest handles this).
- **Placeholder scan**: Workflow uses `Autumn1337` as the example repo owner in `docs/setup.md` — that's intentional (real example), not a placeholder to fill.
