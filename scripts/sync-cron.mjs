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

// prefix → cron value (quoted or bare token, no embedded whitespace or `#`) → optional inline whitespace + comment
const CRON_LINE_RE = /^(\s*-\s*cron:\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'#]+))([ \t]*(?:#.*)?)$/m;

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
