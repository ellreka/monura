// Builds the app in browser mode (base: /demo/) and drops it into
// site/public/demo/. Vite treats public/ as verbatim static passthrough, so
// this one step makes /demo/ work identically in `vite dev` (served as-is,
// no dev-server history fallback swallowing the route) and in `vite build`
// (public/ is copied into dist/ untouched). Run this before both dev and
// build — the desktop (Tauri) build is unaffected since it uses the
// separate root `build` script (base: /, outDir: dist).
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(siteDir, "..");
const demoSrc = path.join(repoRoot, "dist-demo");
const demoDest = path.join(siteDir, "public", "demo");

console.log("[site] building embedded demo (app in browser mode)...");
execSync("pnpm run build:demo", { cwd: repoRoot, stdio: "inherit" });

if (!existsSync(demoSrc)) {
  throw new Error(`expected demo build output at ${demoSrc}`);
}
rmSync(demoDest, { recursive: true, force: true });
mkdirSync(demoDest, { recursive: true });
cpSync(demoSrc, demoDest, { recursive: true });
console.log(`[site] copied demo build into ${path.relative(repoRoot, demoDest)}`);
