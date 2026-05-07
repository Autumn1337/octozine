import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { scheduleToCron, applyCronToWorkflow } from "../../scripts/sync-cron.mjs";

describe("scheduleToCron", () => {
  it("maps weekly", () => {
    expect(scheduleToCron("weekly")).toBe("0 9 * * 1");
  });
  it("maps daily", () => {
    expect(scheduleToCron("daily")).toBe("0 9 * * *");
  });
  it("passes through a literal cron", () => {
    expect(scheduleToCron("30 6 * * 5")).toBe("30 6 * * 5");
  });
  it("passes through @-style", () => {
    expect(scheduleToCron("@hourly")).toBe("@hourly");
  });
  it("throws on unknown alias", () => {
    expect(() => scheduleToCron("yearly")).toThrow();
  });
});

describe("applyCronToWorkflow", () => {
  it("rewrites only the cron line, preserves the rest", async () => {
    const input = await readFile(new URL("../fixtures/sync-cron-input.yml", import.meta.url), "utf8");
    const out = applyCronToWorkflow(input, "30 6 * * 5");
    expect(out).toContain('- cron: "30 6 * * 5"');
    expect(out).not.toContain('- cron: "0 9 * * 1"');
    expect(out).toContain("workflow_dispatch:");
    expect(out).toContain("jobs:");
  });

  it("throws if no cron line found", () => {
    expect(() => applyCronToWorkflow("name: x\non:\n  workflow_dispatch:\n", "0 9 * * 1")).toThrow();
  });
});
