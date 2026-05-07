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
  const json = (await res.json()) as { ok?: boolean; description?: string };
  if (!json.ok) {
    throw new Error(`telegram returned not-ok: ${json.description ?? "(no description)"}`);
  }
}
