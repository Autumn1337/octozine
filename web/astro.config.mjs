import { defineConfig } from "astro/config";

// Auto-detect GitHub Pages deployment context.
// On GitHub Actions: GITHUB_REPOSITORY is "owner/repo"; site = https://<owner>.github.io,
// and base = /<repo> unless the repo is the user-site one (owner.github.io).
// Locally (no env var): site is a placeholder, base is "/".
const repoFull = process.env.GITHUB_REPOSITORY;
const [owner = "example", repo = ""] = repoFull?.split("/") ?? [];
const ownerLc = owner.toLowerCase();
const isUserSite = repo.toLowerCase() === `${ownerLc}.github.io`;
const base = repo && !isUserSite ? `/${repo}` : "/";
const site = `https://${ownerLc}.github.io`;

export default defineConfig({
  site,
  base,
  outDir: "./dist",
  trailingSlash: "ignore",
});
