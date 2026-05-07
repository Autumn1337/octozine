import { describe, it, expect, vi } from "vitest";
import { pushEmail } from "../../src/push/email.js";
import type { IssueData } from "../../src/types.js";

const minimal = (): IssueData => ({
  slug: "2026-W19",
  generatedAt: "2026-05-04T00:00:00Z",
  hero: {
    owner: "a", repo: "b", description: "",
    stars: 1, topics: [],
    url: "https://x",
    sources: ["trending"], sourceMeta: {},
    score: 100, reason: "r",
    summary: { zh: "x", en: "y" },
  },
  items: [],
  meta: {
    config: { schedule: "weekly", languages: ["zh"] },
    profile: { themes: [], languages: [], excludeThemes: [], notes: "" },
    sourceCounts: {},
  },
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
    const arg = (sendMail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; from: string }])[0];
    expect(arg.to).toBe("me@example.com");
    expect(arg.from).toBe("octozine@example.com");
    expect(arg.subject).toContain("2026-W19");
    expect(arg.html).toContain("a/b");
  });

  it("throws if transport is missing", async () => {
    await expect(pushEmail(minimal(), { to: "x", from: "y" })).rejects.toThrow(/transport/i);
  });
});
