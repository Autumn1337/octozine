# Octozine M7 — Push channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add three optional push outputs — **RSS** (Atom feed served from Pages), **Telegram** (bot API), **Email** (SMTP) — so a fork can fan-out each issue to whichever channels the user enables.

**Architecture:** RSS is an Astro endpoint at `web/src/pages/feed.xml.ts` that serializes `data/issues/*.json` as Atom; nothing in the pipeline needs to know about it (it's pure build-time output). Telegram and Email are separate from `runPipeline` — they're triggered by a new `npm run push` command that reads the most recent issue JSON and dispatches to enabled channels in parallel. The workflow runs `push` as its own step after `deploy-pages`, so push failures don't block site publication.

**Tech Stack:** RSS via plain string template (no extra deps). Telegram via `fetch` to Bot API. Email via `nodemailer` (one new runtime dep — battle-tested SMTP client).

---

## Pre-conditions

This plan runs on branch `feat/m7-push`. Before any task starts, run `npm test` and confirm 71/71 baseline passing.

## File Structure

**Create:**
- `web/src/pages/feed.xml.ts` — Astro endpoint, returns `application/atom+xml`
- `src/push/telegram.ts` — `pushTelegram(issue, opts)` + tests
- `src/push/email.ts` — `pushEmail(issue, opts)` + tests
- `src/push/markdown.ts` — `renderTelegramMarkdown(issue)` + `renderEmailHtml(issue)` (shared formatters, small)
- `src/push.ts` — CLI entry: read latest issue, dispatch enabled channels via Promise.allSettled
- `tests/push/telegram.test.ts`
- `tests/push/email.test.ts`
- `tests/push/markdown.test.ts`

**Modify:**
- `package.json` — add `nodemailer` runtime dep, `@types/nodemailer` dev dep, `"push"` script
- `src/types.ts` — already has `outputs.{rss,telegram,email}` shapes; verify
- `web/src/layouts/...` (or `web/src/components/Header.astro`) — add `<link rel="alternate" type="application/atom+xml">` in head
- `.github/workflows/daily.yml` — add a `Push` step after deploy-pages
- `config/config.yaml` — uncomment outputs.{rss,telegram,email} examples
- `docs/setup.md` — document the three secrets (`TELEGRAM_BOT_TOKEN`, `SMTP_HOST/PORT/USER/PASS`)
- `README.md` / `README_EN.md` — one-line note about push channels

---

## Task 1: RSS feed (Atom)

Astro renders `data/issues/*.json` into a static `feed.xml` at build time. We need:
- One `<entry>` per issue, ordered newest first
- `<id>` = canonical Pages URL of the issue
- `<title>` = issue slug + first hero title
- `<content type="html">` = hero summary (zh+en) + items list
- `<updated>` = `issue.generatedAt`

- [ ] **Step 1: Add a small renderer**

```ts
// web/src/lib/feed.ts
import type { IssueData } from "../../../src/types.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderAtomFeed(issues: IssueData[], siteUrl: string, basePath: string): string {
  const ordered = [...issues].sort((a, b) => b.slug.localeCompare(a.slug));
  const updated = ordered[0]?.generatedAt ?? new Date().toISOString();
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  const root = `${siteUrl.replace(/\/+$/, "")}${base}`;

  const entries = ordered.map(issue => {
    const url = `${root}archive/${issue.slug}/`;
    const items = [issue.hero, ...issue.items];
    const body = items.map(i =>
      `<h3>${escape(i.owner)}/${escape(i.repo)} <small>★${i.stars}</small></h3>` +
      `<p>${escape(i.summary.zh)}</p><p>${escape(i.summary.en)}</p>` +
      `<p><em>${escape(i.reason)}</em></p>`,
    ).join("\n");
    return `  <entry>
    <id>${escape(url)}</id>
    <title>${escape(`${issue.slug} · ${issue.hero.owner}/${issue.hero.repo}`)}</title>
    <link href="${escape(url)}"/>
    <updated>${escape(issue.generatedAt)}</updated>
    <content type="html"><![CDATA[
${body}
    ]]></content>
  </entry>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Octozine</title>
  <link href="${escape(root)}"/>
  <link rel="self" href="${escape(root + "feed.xml")}"/>
  <id>${escape(root)}</id>
  <updated>${escape(updated)}</updated>
${entries}
</feed>
`;
}
```

- [ ] **Step 2: Add the Astro endpoint**

```ts
// web/src/pages/feed.xml.ts
import type { APIRoute } from "astro";
import { readIssues } from "../lib/issues.js";
import { renderAtomFeed } from "../lib/feed.js";

export const GET: APIRoute = async ({ site }) => {
  const issues = await readIssues();
  const siteUrl = site?.toString() ?? "https://example.github.io";
  const base = import.meta.env.BASE_URL ?? "/";
  const xml = renderAtomFeed(issues, siteUrl, base);
  return new Response(xml, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
};
```

- [ ] **Step 3: Link the feed in HTML head**

In whatever component owns `<head>` (likely `Header.astro` or `BaseLayout.astro`), add:

```astro
<link rel="alternate" type="application/atom+xml" title="Octozine" href={url('feed.xml')} />
```

(Where `url()` is the helper from `web/src/lib/url.ts`.)

- [ ] **Step 4: Verify build**

```bash
cd web && npm run build
test -f dist/feed.xml && head -20 dist/feed.xml
```

Expected: `feed.xml` exists, valid Atom, contains an `<entry>` for the latest issue.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/feed.ts web/src/pages/feed.xml.ts web/src/components/Header.astro
git commit -m "feat(rss): Atom feed.xml endpoint + autodiscovery link"
```

---

## Task 2: Telegram push

Telegram Bot API `sendMessage` with `parse_mode: MarkdownV2`. We send a compact digest:
- Title line: `*Octozine · {slug}*`
- Hero block: name + stars + reason + link
- Items: `{n}. {owner}/{repo} ★{stars}` with link

Markdown V2 requires escaping a strict set of characters; we provide a helper.

- [ ] **Step 1: Add deps + script**

In `package.json`, add:

```json
"scripts": {
  "pipeline": "node --import tsx/esm src/index.ts",
  "push": "node --import tsx/esm src/push.ts",
  ...
},
"dependencies": {
  ...,
  "nodemailer": "^6.9.0"
},
"devDependencies": {
  ...,
  "@types/nodemailer": "^6.4.0"
}
```

Run `npm install`.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/push/markdown.test.ts
import { describe, it, expect } from "vitest";
import {
  escapeMarkdownV2,
  renderTelegramMarkdown,
  renderEmailHtml,
} from "../../src/push/markdown.js";
import type { IssueData } from "../../src/types.js";

const fixture: IssueData = {
  slug: "2026-W19",
  generatedAt: "2026-05-04T00:00:00Z",
  hero: {
    owner: "ratatui-org", repo: "ratatui",
    description: "Rust TUI",
    stars: 12400,
    topics: ["tui"],
    url: "https://github.com/ratatui-org/ratatui",
    sources: ["trending"],
    sourceMeta: {},
    score: 95,
    reason: "Rust + TUI 命中.",
    summary: { zh: "Ratatui 是…", en: "Ratatui is…" },
  },
  items: [{
    owner: "rust-lang", repo: "rust",
    description: "lang",
    stars: 90000,
    topics: [],
    url: "https://github.com/rust-lang/rust",
    sources: ["trending"],
    sourceMeta: {},
    score: 80,
    reason: "底层.",
    summary: { zh: "Rust 是…", en: "Rust is…" },
  }],
  meta: { config: { schedule: "weekly", languages: ["zh","en"] }, profile: { themes:[], languages:[], excludeThemes:[], notes:"" }, sourceCounts: { trending: 2 } },
};

describe("escapeMarkdownV2", () => {
  it("escapes the reserved set", () => {
    expect(escapeMarkdownV2("a.b!c-d")).toBe("a\\.b\\!c\\-d");
    expect(escapeMarkdownV2("(x)[y]{z}")).toBe("\\(x\\)\\[y\\]\\{z\\}");
  });
});

describe("renderTelegramMarkdown", () => {
  it("includes slug, hero, and items with escaped reserved chars", () => {
    const out = renderTelegramMarkdown(fixture);
    expect(out).toContain("Octozine");
    expect(out).toContain("2026\\-W19");
    expect(out).toContain("ratatui\\-org/ratatui");
    expect(out).toContain("rust\\-lang/rust");
    expect(out).toContain("https://github.com/ratatui-org/ratatui");
  });
});

describe("renderEmailHtml", () => {
  it("returns html with hero + items", () => {
    const out = renderEmailHtml(fixture);
    expect(out).toContain("<html");
    expect(out).toContain("ratatui-org/ratatui");
    expect(out).toContain("Ratatui 是");
    expect(out).toContain("Ratatui is");
  });
});
```

```ts
// tests/push/telegram.test.ts
import { describe, it, expect, vi } from "vitest";
import { pushTelegram } from "../../src/push/telegram.js";
import type { IssueData } from "../../src/types.js";

const minimal = (slug = "2026-W19"): IssueData => ({
  slug, generatedAt: "2026-05-04T00:00:00Z",
  hero: { owner: "a", repo: "b", description: "", stars: 1, topics: [], url: "https://github.com/a/b", sources: ["trending"], sourceMeta: {}, score: 100, reason: "r", summary: { zh: "x", en: "y" } },
  items: [], meta: { config: { schedule: "weekly", languages: ["zh"] }, profile: { themes:[], languages:[], excludeThemes:[], notes:"" }, sourceCounts: {} },
});

describe("pushTelegram", () => {
  it("POSTs sendMessage with markdown_v2 to bot API", async () => {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = (vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }));
    })) as unknown as typeof fetch;

    await pushTelegram(minimal(), { token: "TOKEN", chatId: "123" });
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    const body = JSON.parse(calls[0]!.body);
    expect(body.chat_id).toBe("123");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("Octozine");
  });

  it("throws on bot API error", async () => {
    globalThis.fetch = (vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 })
    )) as unknown as typeof fetch;
    await expect(pushTelegram(minimal(), { token: "T", chatId: "0" })).rejects.toThrow(/telegram/i);
  });
});
```

```ts
// tests/push/email.test.ts
import { describe, it, expect, vi } from "vitest";
import { pushEmail } from "../../src/push/email.js";
import type { IssueData } from "../../src/types.js";

const minimal = (): IssueData => ({
  slug: "2026-W19", generatedAt: "2026-05-04T00:00:00Z",
  hero: { owner: "a", repo: "b", description: "", stars: 1, topics: [], url: "https://x", sources: ["trending"], sourceMeta: {}, score: 100, reason: "r", summary: { zh: "x", en: "y" } },
  items: [], meta: { config: { schedule: "weekly", languages: ["zh"] }, profile: { themes:[], languages:[], excludeThemes:[], notes:"" }, sourceCounts: {} },
});

describe("pushEmail", () => {
  it("calls the injected transport with correct payload", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "fake@id" }));
    const transport = { sendMail } as unknown as Parameters<typeof pushEmail>[1]["transport"];
    await pushEmail(minimal(), {
      transport,
      to: "me@example.com",
      from: "octozine@example.com",
    });
    expect(sendMail).toHaveBeenCalledOnce();
    const arg = sendMail.mock.calls[0]![0] as { to: string; subject: string; html: string; from: string };
    expect(arg.to).toBe("me@example.com");
    expect(arg.from).toBe("octozine@example.com");
    expect(arg.subject).toContain("2026-W19");
    expect(arg.html).toContain("a/b");
  });
});
```

- [ ] **Step 3: Implement `src/push/markdown.ts`**

```ts
// src/push/markdown.ts
import type { IssueData, SummarizedItem } from "../types.js";

const RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(s: string): string {
  return s.replace(RESERVED, "\\$&");
}

const fmtItem = (n: number, i: SummarizedItem) =>
  `${n}\\. *${escapeMarkdownV2(`${i.owner}/${i.repo}`)}* \\(★${i.stars}\\)\n` +
  `${escapeMarkdownV2(i.summary.zh)}\n` +
  `_${escapeMarkdownV2(i.reason)}_\n` +
  i.url;  // bare URLs don't need escaping in MarkdownV2

export function renderTelegramMarkdown(issue: IssueData): string {
  const head = `*Octozine · ${escapeMarkdownV2(issue.slug)}*`;
  const hero = fmtItem(1, issue.hero);
  const rest = issue.items.map((it, idx) => fmtItem(idx + 2, it)).join("\n\n");
  return [head, hero, rest].filter(Boolean).join("\n\n");
}

export function renderEmailHtml(issue: IssueData): string {
  const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const item = (i: SummarizedItem) => `
    <h3 style="margin: 1.5rem 0 .25rem; font-family: Georgia, serif;">
      <a href="${e(i.url)}" style="color:#1a1a1a; text-decoration: none;">${e(`${i.owner}/${i.repo}`)}</a>
      <span style="color:#888; font-size:0.85em; font-family: monospace;"> ★${i.stars}</span>
    </h3>
    <p>${e(i.summary.zh)}</p>
    <p style="color:#555;">${e(i.summary.en)}</p>
    <p style="color:#B45309; font-style: italic; border-left: 3px solid #B45309; padding-left: 0.75rem;">${e(i.reason)}</p>
  `;
  return `<!doctype html><html><body style="font-family: -apple-system, Inter, system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #FAFAF7;">
    <h1 style="font-family: Georgia, serif;">Octozine · ${e(issue.slug)}</h1>
    ${[issue.hero, ...issue.items].map(item).join("\n")}
  </body></html>`;
}
```

- [ ] **Step 4: Implement `src/push/telegram.ts`**

```ts
// src/push/telegram.ts
import { renderTelegramMarkdown } from "./markdown.js";
import type { IssueData } from "../types.js";

export type TelegramOpts = { token: string; chatId: string };

export async function pushTelegram(issue: IssueData, opts: TelegramOpts): Promise<void> {
  const url = `https://api.telegram.org/bot${opts.token}/sendMessage`;
  const text = renderTelegramMarkdown(issue);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: opts.chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`telegram sendMessage failed: HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json() as { ok?: boolean; description?: string };
  if (!json.ok) throw new Error(`telegram returned not-ok: ${json.description ?? "(no description)"}`);
}
```

- [ ] **Step 5: Implement `src/push/email.ts`**

```ts
// src/push/email.ts
import nodemailer from "nodemailer";
import { renderEmailHtml } from "./markdown.js";
import type { IssueData } from "../types.js";
import type { Transporter } from "nodemailer";

export type EmailOpts = {
  to: string;
  from: string;
  /** Test seam — pass a pre-built transport instead of constructing from SMTP creds */
  transport?: Pick<Transporter, "sendMail">;
};

export type SmtpOpts = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export function buildTransport(s: SmtpOpts): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
  });
}

export async function pushEmail(issue: IssueData, opts: EmailOpts): Promise<void> {
  if (!opts.transport) throw new Error("pushEmail: no transport provided (call buildTransport from SMTP env vars)");
  await opts.transport.sendMail({
    from: opts.from,
    to: opts.to,
    subject: `Octozine · ${issue.slug} · ${issue.hero.owner}/${issue.hero.repo}`,
    html: renderEmailHtml(issue),
  });
}
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/push/
```

All green.

- [ ] **Step 7: Commit**

```bash
git add src/push tests/push package.json package-lock.json
git commit -m "feat(push): telegram + email channels with markdown/html renderers"
```

---

## Task 3: CLI entry + workflow integration

**Files:**
- Create: `src/push.ts`
- Modify: `.github/workflows/daily.yml`

`npm run push` reads the most recent `data/issues/*.json`, parses config, and dispatches to enabled channels via `Promise.allSettled`. Failures are reported with full error text and the process exits non-zero if **any** channel failed (so the workflow step shows red), but each channel is independent.

- [ ] **Step 1: Implement `src/push.ts`**

```ts
// src/push.ts
import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { parseConfig } from "./config.js";
import { pushTelegram } from "./push/telegram.js";
import { pushEmail, buildTransport } from "./push/email.js";
import type { IssueData } from "./types.js";

async function loadLatestIssue(root: string): Promise<IssueData> {
  const dir = path.join(root, "data/issues");
  const names = await readdir(dir);
  const slugs = names.filter(f => f.endsWith(".json")).sort().reverse();
  if (slugs.length === 0) throw new Error("no issue JSON found in data/issues/");
  const slug = slugs[0]!;
  return JSON.parse(await readFile(path.join(dir, slug), "utf8")) as IssueData;
}

export async function runPush(root = process.cwd()): Promise<void> {
  const cfgText = await readFile(path.join(root, "config/config.yaml"), "utf8");
  const config = parseConfig(cfgText);
  const issue = await loadLatestIssue(root);

  const dispatches: Array<{ name: string; run: () => Promise<void> }> = [];

  if (config.outputs.telegram?.enabled) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("outputs.telegram.enabled but TELEGRAM_BOT_TOKEN secret is missing");
    dispatches.push({
      name: "telegram",
      run: () => pushTelegram(issue, { token, chatId: config.outputs.telegram!.chatId }),
    });
  }

  if (config.outputs.email?.enabled) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM ?? user;
    if (!host || !user || !pass || !from) {
      throw new Error("outputs.email.enabled but SMTP_HOST/USER/PASS/FROM env not all set");
    }
    const transport = buildTransport({ host, port, user, pass });
    dispatches.push({
      name: "email",
      run: () => pushEmail(issue, { transport, to: config.outputs.email!.to, from }),
    });
  }

  if (dispatches.length === 0) {
    console.log("[push] no channels enabled; nothing to do.");
    return;
  }

  const results = await Promise.allSettled(dispatches.map(d => d.run()));
  let failed = 0;
  results.forEach((r, i) => {
    const name = dispatches[i]!.name;
    if (r.status === "fulfilled") {
      console.log(`[push] ${name}: ok`);
    } else {
      failed++;
      console.error(`[push] ${name}: FAIL`, (r.reason as Error)?.message ?? r.reason);
    }
  });
  if (failed > 0) throw new Error(`${failed}/${dispatches.length} push channels failed`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPush().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Add the workflow step**

In `.github/workflows/daily.yml`, **after** the `Deploy to Pages` step and **before** the `Commit new issue data` step:

```yaml
      - name: Push (telegram / email)
        if: success()
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          SMTP_FROM: ${{ secrets.SMTP_FROM }}
        run: npm run push
        continue-on-error: true       # push failures must not block commit-back
```

`continue-on-error: true` is deliberate: site is already deployed, data is already on disk, push is a fire-and-forget side channel. The step still appears red in the UI when it fails, so the user knows.

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/push.ts .github/workflows/daily.yml
git commit -m "feat(push): CLI entry + workflow step gated by config flags"
```

---

## Task 4: Config + docs

**Files:**
- Modify: `config/config.yaml`
- Modify: `docs/setup.md`
- Modify: `README.md`, `README_EN.md`

- [ ] **Step 1: Expand outputs in config.yaml**

Replace:

```yaml
outputs:
  pages: { enabled: true }
```

with:

```yaml
outputs:
  pages: { enabled: true }
  rss:   { enabled: true }              # always-on if Pages is on; serves at /feed.xml
  telegram:
    enabled: false
    chat_id: ""                         # set chat_id; bot token goes in TELEGRAM_BOT_TOKEN secret
  email:
    enabled: false
    to: ""                              # recipient; SMTP creds in secrets (see docs/setup.md)
```

- [ ] **Step 2: Add `Push channels` section to setup.md**

Append before "Troubleshooting":

```markdown
## Optional: push channels (Telegram / Email)

Each channel is independent — enable any combination, or none.

### RSS

Always-on. The site exposes `/feed.xml` (Atom). Add this URL to your RSS reader.

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
```

- [ ] **Step 3: Add a one-line note in both READMEs**

In the section after "History archive":

**README.md** (中文):
```markdown
## 推送渠道（可选）

除了 GitHub Pages，每期还可以推送到 **Telegram bot**、**Email (SMTP)**、**RSS / Atom feed**。
全部 opt-in，配置见 [docs/setup.md](./docs/setup.md#可选-推送渠道-telegram--email)。
```

**README_EN.md**:
```markdown
## Push channels (optional)

Beyond GitHub Pages, each issue can also fan-out to **Telegram (bot)**, **Email (SMTP)**, and **RSS / Atom**.
All opt-in. See [docs/setup.md](./docs/setup.md#optional-push-channels-telegram--email).
```

- [ ] **Step 4: Run typecheck + tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 5: Commit**

```bash
git add config/config.yaml docs/setup.md README.md README_EN.md
git commit -m "docs(m7): document Telegram / Email / RSS push channels"
```

---

## Self-Review

**Spec coverage check:**
- §3 多端推送 — RSS (Task 1), Telegram (Task 2), Email (Task 2) ✓
- §10 outputs.{rss,telegram,email} 配置 — Task 4 ✓
- §15 Action 步骤 — Task 3 (`Push` step gated, runs after deploy) ✓
- §12 push 失败不阻塞 publication — `continue-on-error: true` ✓ (still surfaces as red step)

**Placeholder scan:** none.

**Type consistency:** `EmailOpts.transport` is `Pick<Transporter, "sendMail">` so tests can pass a mock without the full nodemailer API surface.

**Ambiguity check resolved:**
- "Push failure handling": separate workflow step + `continue-on-error: true` (issue lands on Pages even if push misconfigured; the step turns red so user notices)
- "Auth source": Telegram via `TELEGRAM_BOT_TOKEN` secret; Email via SMTP_* secrets — both surfaced in setup.md
- "Multiple channels": `Promise.allSettled` so one channel's failure doesn't kill the others; final step exits non-zero if any failed
