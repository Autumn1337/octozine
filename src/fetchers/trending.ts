import * as cheerio from "cheerio";
import type { Candidate, Source } from "../types.js";

export type TrendingOpts = {
  langs: string[];                                    // empty = all-language page
  window: "daily" | "weekly" | "monthly";
};

const BASE = "https://github.com/trending";

export async function fetchTrending(opts: TrendingOpts): Promise<Candidate[]> {
  const langs = opts.langs.length > 0 ? opts.langs : [""];
  const all: Candidate[] = [];
  for (const lang of langs) {
    const url = `${BASE}${lang ? "/" + encodeURIComponent(lang) : ""}?since=${opts.window}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "octozine/0.1" } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const html = await res.text();
      all.push(...parseTrending(html, opts.window));
    } catch (e) {
      console.warn(`[fetch:trending] ${lang || "all"} failed:`, (e as Error).message);
    }
  }
  if (all.length === 0) {
    throw new Error("trending fetch failed: all language pages returned zero usable results");
  }
  return all;
}

export function parseTrending(html: string, window: string = "weekly"): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  $("article.Box-row").each((_, el) => {
    const a = $(el).find("h2 a");
    const href = (a.attr("href") ?? "").trim().replace(/^\//, "");
    const [owner, repo] = href.split("/");
    if (!owner || !repo) return;
    const description = $(el).find("p").text().trim();
    const language = $(el).find("[itemprop='programmingLanguage']").text().trim() || undefined;
    const stargazers = $(el).find("a[href$='/stargazers']").text().trim();
    const stars = parseInt(stargazers.replace(/,/g, ""), 10) || 0;
    const deltaText = $(el).find(".d-inline-block.float-sm-right").text().trim();
    const deltaMatch = deltaText.match(/([\d,]+)/);
    const starsDelta = deltaMatch && deltaMatch[1] ? parseInt(deltaMatch[1].replace(/,/g, ""), 10) : undefined;
    const item: Candidate = {
      owner,
      repo,
      description,
      stars,
      ...(starsDelta !== undefined ? { starsDelta } : {}),
      ...(language ? { language } : {}),
      topics: [],
      url: `https://github.com/${owner}/${repo}`,
      sources: ["trending" as Source],
      sourceMeta: { trending: { window } },
    };
    out.push(item);
  });
  return out;
}
