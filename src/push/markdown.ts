import type { IssueData, SummarizedItem } from "../types.js";

const RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(s: string): string {
  return s.replace(RESERVED, "\\$&");
}

const fmtItem = (n: number, i: SummarizedItem): string =>
  `${n}\\. *${escapeMarkdownV2(`${i.owner}/${i.repo}`)}* \\(★${i.stars}\\)\n` +
  `${escapeMarkdownV2(i.summary.zh)}\n` +
  `_${escapeMarkdownV2(i.reason)}_\n` +
  i.url;

export function renderTelegramMarkdown(issue: IssueData): string {
  const head = `*Octozine · ${escapeMarkdownV2(issue.slug)}*`;
  const hero = fmtItem(1, issue.hero);
  const rest = issue.items.map((it, idx) => fmtItem(idx + 2, it)).join("\n\n");
  return [head, hero, rest].filter(Boolean).join("\n\n");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

export function renderEmailHtml(issue: IssueData): string {
  const e = escapeHtml;
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
