import type { IssueDataLite } from "./issues.js";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;")
   .replace(/'/g, "&#39;");

type Item = {
  owner: string; repo: string; stars: number;
  url: string;
  reason: string;
  summary: { zh: string; en: string };
};

export function renderAtomFeed(issues: IssueDataLite[], siteUrl: string, basePath: string): string {
  const ordered = [...issues].sort((a, b) => b.slug.localeCompare(a.slug));
  const updated = ordered[0]?.generatedAt ?? new Date().toISOString();
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  const root = `${siteUrl.replace(/\/+$/, "")}${base}`;

  const entries = ordered.map(issue => {
    const url = `${root}archive/${issue.slug}/`;
    const items = [issue.hero as Item, ...((issue.items ?? []) as Item[])];
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
