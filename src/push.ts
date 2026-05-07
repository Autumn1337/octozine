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
