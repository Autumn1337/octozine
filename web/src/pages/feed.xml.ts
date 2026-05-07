import type { APIRoute } from "astro";
import { listIssues, loadIssue } from "../lib/issues.js";
import { renderAtomFeed } from "../lib/feed.js";

export const GET: APIRoute = async ({ site }) => {
  const files = await listIssues();
  const issues = await Promise.all(files.map(f => loadIssue(f)));
  const siteUrl = site?.toString() ?? "https://example.github.io/";
  const base = import.meta.env.BASE_URL ?? "/";
  const xml = renderAtomFeed(issues, siteUrl, base);
  return new Response(xml, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
};
