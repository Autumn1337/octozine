// Tiny helper to join a path under Astro's `base` (which has no trailing slash).
//
//   url("/")          → "/octozine/"
//   url("/archive/")  → "/octozine/archive/"
//   url("foo")        → "/octozine/foo"
//
// When base is "/" (local dev), no double-slash is emitted.

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

export function url(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${p}` || "/";
}
