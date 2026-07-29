/**
 * Loader hook so tests can import the REAL app modules (never a copy):
 *   - appends .ts to extensionless relative imports
 *   - maps "@/x" -> <repo>/src/x
 *   - resolves bare packages from the repo's node_modules
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./reshook.mjs test.mts
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const resolveTs = (base) => {
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
};

export async function resolve(specifier, context, next) {
  // "@/lib/store" -> <repo>/src/lib/store.ts
  if (specifier.startsWith("@/")) {
    const hit = resolveTs(path.join(SRC, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  // extensionless relative import from a .ts file -> add .ts/.tsx/index.ts
  if (specifier.startsWith(".") && !/\.(ts|tsx|mjs|js|json)$/.test(specifier)) {
    const parentPath = context.parentURL?.startsWith("file:")
      ? path.dirname(new URL(context.parentURL).pathname)
      : process.cwd();
    const hit = resolveTs(path.resolve(parentPath, specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  // bare package from a module living outside the repo -> resolve against the repo
  if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("node:")) {
    try {
      return await next(specifier, context);
    } catch (err) {
      const { createRequire } = await import("node:module");
      const req = createRequire(path.join(ROOT, "package.json"));
      try {
        return { url: pathToFileURL(req.resolve(specifier)).href, shortCircuit: true };
      } catch {
        throw err;
      }
    }
  }

  return next(specifier, context);
}
