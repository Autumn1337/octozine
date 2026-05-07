import type { IssueData, SummarizedItem } from "../types.js";

const RESERVED = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(s: string): string {
  return s.replace(RESERVED, "\\$&");
}

const fmtItem = (n: number, i: SummarizedItem): string =>
  `${n}\\. *${escapeMarkdownV2(`${i.owner}/${i.repo}`)}* \\(★${i.stars}\\)\n` +
  `${escapeMarkdownV2(i.summary.zh)}\n` +
  `_${escapeMarkdownV2(i.reason)}_\n` +
  escapeMarkdownV2(i.url);

// Telegram sendMessage hard-limits text to 4096 chars. With topN = 5 a typical
// issue is ~1500–2000 chars, but topN = 10 + bilingual reasons can blow past it.
// We cap at 4000 (96 char buffer) and append a "...还有 N 条" tail.
const TELEGRAM_MAX = 4000;

export function renderTelegramMarkdown(issue: IssueData): string {
  const head = `*Octozine · ${escapeMarkdownV2(issue.slug)}*`;
  const hero = fmtItem(1, issue.hero);

  // Append items one at a time, stopping before we exceed the budget.
  const blocks: string[] = [head, hero];
  let runningLen = head.length + hero.length + 4; // +4 for separator "\n\n"s
  let dropped = 0;
  for (let i = 0; i < issue.items.length; i++) {
    const item = issue.items[i]!;
    const block = fmtItem(i + 2, item);
    if (runningLen + 2 + block.length > TELEGRAM_MAX) {
      dropped = issue.items.length - i;
      break;
    }
    blocks.push(block);
    runningLen += 2 + block.length;
  }
  if (dropped > 0) {
    blocks.push(`_…还有 ${dropped} 条,见站点完整版。_`);
  }
  return blocks.join("\n\n");
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
