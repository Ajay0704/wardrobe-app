// Figma export: visits every scene at desktop (web chrome) and mobile (native iOS shell),
// with a seeded, populated closet, and writes
//   figma-export/screens/NN-<slug>-<viewport>.png   2x full-page screenshots
//   figma-export/html/NN-<slug>-<viewport>.html     self-contained snapshots for html.to.design
//   figma-export/manifest.json                      what was captured + per-scene diagnostics
//
// Needs the dev server for THIS tree running (default http://localhost:3217) with Supabase
// unconfigured (no .env.local), so the app runs ungated and never syncs. The throwaway harness
// page src/app/navtest-figma/page.tsx is installed from scripts/harness-page.tsx.txt for the run
// and removed on exit, so src/ is left untouched.
//
//   BASE_URL=http://localhost:3217 node figma-export/scripts/export.mjs [--only slug,slug] [--viewport desktop|mobile]

import { chromium, devices } from "playwright";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scenes } from "./scenes.mjs";
import { closetShare, persistedStore, profile, publicProfile } from "./seed.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL ?? "http://localhost:3217";
const HARNESS = "/navtest-figma";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const onlySlugs = flag("--only")?.split(",");
const onlyViewport = flag("--viewport");
// --figma <captures.json>: instead of PNG/HTML, submit each scene to Figma as editable layers.
// captures.json maps output name (e.g. "06-closet-mobile") → a capture id from the Figma MCP
// `generate_figma_design` tool. Ids are single-use; scenes without one are skipped.
const figmaIds = flag("--figma") ? JSON.parse(await readFile(flag("--figma"), "utf8")) : null;
const captureJs = figmaIds
  ? await (await fetch("https://mcp.figma.com/mcp/html-to-design/capture.js")).text()
  : null;

const VIEWPORTS = [
  { name: "desktop", context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  {
    name: "mobile",
    context: {
      ...devices["iPhone 13"],
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    },
  },
];

const harnessDir = join(ROOT, "../src/app/navtest-figma");
if (!existsSync(harnessDir)) {
  mkdirSync(harnessDir, { recursive: true });
  copyFileSync(join(ROOT, "scripts/harness-page.tsx.txt"), join(harnessDir, "page.tsx"));
  const cleanup = () => rmSync(harnessDir, { recursive: true, force: true });
  process.on("exit", cleanup);
  // `exit` handlers don't run on signals by default — route them through exit.
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
}

const serialize = (await readFile(join(ROOT, "scripts/serialize.browser.js"), "utf8")).trim().replace(/;$/, "");

/** Fonts loaded, images decoded, finite animations finished, layout quiet. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 6000); })),
    );
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect?.getTiming?.();
      if (t && t.iterations !== Infinity) {
        try { a.finish(); } catch { /* ignore */ }
      }
    }
  });
  await page.waitForTimeout(300);
}

/**
 * Height the whole screen needs. The native shell scrolls inside an inner container (so the
 * document never grows), and Chromium's fullPage capture leaves fixed chrome at its original
 * viewport position — the tab bar would land mid-page. Instead we grow the VIEWPORT to the
 * content height: dvh layouts stretch, the inner scroller stops scrolling, and fixed bars sit
 * at the true top/bottom, exactly like a tall phone.
 */
function contentHeight(page) {
  return page.evaluate(() => {
    let extra = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
      if (el.clientHeight < innerHeight * 0.4) continue;
      extra = Math.max(extra, el.scrollHeight - el.clientHeight);
    }
    return Math.max(document.scrollingElement.scrollHeight, innerHeight + extra);
  });
}

async function growToContent(page, base) {
  for (let i = 0; i < 3; i++) {
    const h = Math.min(await contentHeight(page), 12_000);
    const cur = page.viewportSize().height;
    if (h <= cur + 2) break;
    await page.setViewportSize({ width: base.width, height: Math.ceil(h) });
    await page.waitForTimeout(400);
  }
}

async function stubBackend(context) {
  await context.route("**/api/profile/**", (r) =>
    r.fulfill({ json: publicProfile }));
  await context.route(/\/api\/closet-share\?id=/, (r) =>
    r.fulfill({ json: closetShare }));
}

const manifest = { base: BASE, generatedAt: new Date().toISOString(), screens: [] };
await mkdir(join(ROOT, "screens"), { recursive: true });
await mkdir(join(ROOT, "html"), { recursive: true });

const browser = await chromium.launch();
const ordered = scenes.filter((s) => !onlySlugs || onlySlugs.includes(s.slug));

for (const vp of VIEWPORTS) {
  if (onlyViewport && vp.name !== onlyViewport) continue;
  for (const theme of ["light", "dark"]) {
    const group = ordered.filter((s) => (s.theme ?? "light") === theme && (!s.only || s.only === vp.name));
    if (!group.length) continue;
    const context = await browser.newContext({ ...vp.context, colorScheme: theme });
    await context.addInitScript(
      ({ store, native }) => {
        try {
          localStorage.setItem("wardrobe-store-v2", store);
          if (native) localStorage.setItem("wardrobe:native-shell", "1");
          else localStorage.removeItem("wardrobe:native-shell");
        } catch { /* ignore */ }
      },
      { store: persistedStore(theme), native: vp.name === "mobile" },
    );
    await stubBackend(context);

    for (const scene of group) {
      const n = String(scenes.indexOf(scene) + 1).padStart(2, "0");
      const name = `${n}-${scene.slug}-${vp.name}`;
      if (figmaIds && !figmaIds[name]) continue;
      const page = await context.newPage();
      const diag = { consoleErrors: [], failedRequests: [] };
      page.on("console", (m) => m.type() === "error" && diag.consoleErrors.push(m.text().slice(0, 300)));
      page.on("pageerror", (e) => diag.consoleErrors.push(String(e).slice(0, 300)));
      page.on("response", (res) => {
        const u = res.url();
        if (res.status() >= 400 && !u.includes("/_next/")) diag.failedRequests.push(`${res.status()} ${u.replace(BASE, "")}`);
      });
      page.on("requestfailed", (req) => {
        const u = req.url();
        const why = req.failure()?.errorText ?? "";
        // Aborted = a remount re-requested the same image; the render is unaffected.
        if (!u.includes("/_next/webpack-hmr") && !why.includes("ERR_ABORTED")) {
          diag.failedRequests.push(`FAILED(${why}) ${u.replace(BASE, "")}`);
        }
      });

      const url = BASE + (scene.route ?? HARNESS);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      } catch {
        await page.waitForLoadState("load").catch(() => {});
      }
      if (scene.state) {
        await page.waitForFunction(() => window.__w, null, { timeout: 30_000 });
        // A signed-in look (avatar menu, not "Log in"). Safe: with Supabase unconfigured,
        // AuthProvider never syncs, so this user never leaves the page.
        const signedIn = { authUser: { id: "fx-user", email: profile.email }, authChecked: true };
        await page.evaluate((patch) => window.__w.setState(patch), { ...signedIn, ...scene.state });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      }
      // Next's dev-tools bubble is not part of the app.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
      await settle(page);
      await growToContent(page, vp.context.viewport);
      await settle(page);

      if (figmaIds) {
        const id = figmaIds[name];
        await page.evaluate((s) => {
          const el = document.createElement("script");
          el.textContent = s;
          document.head.appendChild(el);
        }, captureJs);
        await page.waitForTimeout(500);
        // captureForDesign's promise doesn't settle after a successful submit, so wait for the
        // submit request itself (2xx) and move on; poll generate_figma_design to confirm.
        const submitted = page.waitForResponse((r) => r.url().includes(`/capture/${id}/submit`), { timeout: 90_000 });
        try {
          page
            .evaluate(
              ({ id }) =>
                window.figma.captureForDesign({
                  captureId: id,
                  endpoint: `https://mcp.figma.com/mcp/capture/${id}/submit?bindVariables=true`,
                  selector: "body",
                }),
              { id },
            )
            .catch(() => {});
          const res = await submitted;
          console.log(`${name.padEnd(42)} → figma ${id.slice(0, 8)} HTTP ${res.status()}`);
        } catch (e) {
          console.log(`${name.padEnd(42)} → figma FAILED ${String(e).slice(0, 160)}`);
        }
        await page.close();
        continue;
      }

      await page.screenshot({ path: join(ROOT, "screens", `${name}.png`), fullPage: true, animations: "disabled" });
      let htmlBytes = 0;
      try {
        const html = await page.evaluate(`(${serialize})()`);
        await writeFile(join(ROOT, "html", `${name}.html`), html);
        htmlBytes = html.length;
      } catch (e) {
        diag.consoleErrors.push(`serialize failed: ${String(e).slice(0, 200)}`);
      }
      const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 160);
      manifest.screens.push({
        file: name, slug: scene.slug, title: scene.title, viewport: vp.name, theme,
        url: url.replace(BASE, ""), state: scene.state ?? null, htmlBytes, textSample: text, ...diag,
      });
      console.log(`${name.padEnd(42)} ${String(htmlBytes).padStart(9)}B  ${diag.failedRequests.length ? "⚠ " + diag.failedRequests.length + " failed req" : ""}`);
      await page.close();
    }
    await context.close();
  }
}

await browser.close();
// A Figma run writes no PNG/HTML, so it must not touch the capture manifest.
if (figmaIds) process.exit(0);
manifest.screens.sort((a, b) => a.file.localeCompare(b.file));
const prev = onlySlugs || onlyViewport
  ? JSON.parse(await readFile(join(ROOT, "manifest.json"), "utf8").catch(() => '{"screens":[]}'))
  : { screens: [] };
const merged = new Map(prev.screens.map((s) => [s.file, s]));
for (const s of manifest.screens) merged.set(s.file, s);
manifest.screens = [...merged.values()].sort((a, b) => a.file.localeCompare(b.file));
await writeFile(join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.screens.length} screens → ${ROOT}`);
