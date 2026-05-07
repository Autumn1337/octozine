import { readFile, readdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export type IssueDataLite = {
  slug: string;
  generatedAt: string;
  hero: any;
  items: any[];
  meta: any;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const issuesDir = path.resolve(here, "../../../data/issues");

export async function listIssues(): Promise<string[]> {
  const files = await readdir(issuesDir);
  return files
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();
}

export async function loadIssue(filename: string): Promise<IssueDataLite> {
  const text = await readFile(path.join(issuesDir, filename), "utf8");
  return JSON.parse(text) as IssueDataLite;
}

export async function loadLatest(): Promise<IssueDataLite | null> {
  const files = await listIssues();
  if (files.length === 0) return null;
  return loadIssue(files[0]!);
}
