// Runs INSIDE the page (passed to page.evaluate). Returns a self-contained HTML string:
// every element carries its computed style (diffed against the browser default for its tag,
// so files stay small), ::before/::after are materialised as rules, and images, CSS
// backgrounds, canvases and fonts are inlined as data: URLs. No scripts survive — this is a
// frozen render for the html.to.design plugin, not a runnable page.
// A bare expression on purpose: export.mjs wraps it as `(<this file>)()`.
/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */
async () => {
  const cache = new Map();
  const toDataUrl = async (url) => {
    if (!url || url.startsWith("data:")) return url;
    const abs = new URL(url, location.href).href;
    if (!cache.has(abs)) {
      cache.set(
        abs,
        fetch(abs)
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) =>
            b
              ? new Promise((res) => {
                  const fr = new FileReader();
                  fr.onload = () => res(fr.result);
                  fr.onerror = () => res(abs);
                  fr.readAsDataURL(b);
                })
              : abs,
          )
          .catch(() => abs),
      );
    }
    return cache.get(abs);
  };
  const inlineUrls = async (css) => {
    const urls = [...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]);
    for (const u of urls) css = css.split(u).join(await toDataUrl(u));
    return css;
  };

  // Browser defaults per tag, measured in a blank same-origin iframe.
  const sandbox = document.createElement("iframe");
  sandbox.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(sandbox);
  const sdoc = sandbox.contentDocument;
  const defaults = new Map();
  const defaultsFor = (el) => {
    const key = el.namespaceURI + ":" + el.localName;
    if (!defaults.has(key)) {
      const d = sdoc.createElementNS(el.namespaceURI, el.localName);
      sdoc.body.appendChild(d);
      const cs = sandbox.contentWindow.getComputedStyle(d);
      const o = {};
      for (const p of cs) o[p] = cs.getPropertyValue(p);
      d.remove();
      defaults.set(key, o);
    }
    return defaults.get(key);
  };
  const SKIP = /^(-webkit-locale|transition|animation|will-change|cursor|caret-color|pointer-events|user-select|-webkit-user-select|touch-action)/;
  const diffDecl = (cs, base) => {
    let out = "";
    for (const p of cs) {
      // Custom properties (Tailwind's --tw-*, theme vars) inherit onto every node; computed
      // values already have var() resolved, so they're pure weight here.
      if (p.startsWith("--") || SKIP.test(p)) continue;
      const v = cs.getPropertyValue(p);
      if (v !== base[p] || pinned(cs, p)) out += `${p}:${v};`;
    }
    return out;
  };
  // A width that equals the default only because the default style is `none`. Tailwind's
  // preflight sets `border: 0 solid` everywhere: drop the 0 and the frozen page renders every
  // box with a 3px `medium` border.
  const pinned = (cs, p) => {
    const m = /^(border-(?:top|right|bottom|left)|outline|column-rule)-width$/.exec(p);
    return !!m && cs.getPropertyValue(`${m[1]}-style`) !== "none";
  };

  const originals = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
  const clone = document.documentElement.cloneNode(true);
  const clones = [clone, ...clone.querySelectorAll("*")];

  const pseudoRules = [];
  const bgJobs = [];
  for (let i = 0; i < originals.length; i++) {
    const el = originals[i];
    const cl = clones[i];
    if (!cl || el.localName !== cl.localName) continue;
    const tag = el.localName;
    if (tag === "script" || tag === "noscript" || tag === "template" || tag === "iframe") {
      cl.remove();
      continue;
    }
    if (tag === "style" || (tag === "link" && el.rel !== "icon")) {
      cl.remove();
      continue;
    }
    if (tag === "head" || tag === "meta" || tag === "title") continue;

    const cs = getComputedStyle(el);
    // Kept-alive hidden tabs and closed menus aren't on screen — don't ship them to Figma.
    if (cs.display === "none" && el !== document.body) {
      cl.remove();
      continue;
    }
    const decl = diffDecl(cs, defaultsFor(el));
    if (decl) {
      if (/url\(/.test(decl)) bgJobs.push(inlineUrls(decl).then((d) => cl.setAttribute("style", d)));
      else cl.setAttribute("style", decl);
    }
    cl.removeAttribute("class");

    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue("content");
      if (!content || content === "none" || content === "normal") continue;
      const id = `fx${i}`;
      cl.setAttribute("data-fx", id);
      let rule = "";
      for (const p of ps) {
        if (p.startsWith("--") || SKIP.test(p)) continue;
        rule += `${p}:${ps.getPropertyValue(p)};`;
      }
      pseudoRules.push(inlineUrls(`[data-fx="${id}"]${pseudo}{${rule}}`));
    }

    if (tag === "img") {
      const src = el.currentSrc || el.src;
      cl.removeAttribute("srcset");
      cl.removeAttribute("sizes");
      cl.removeAttribute("loading");
      bgJobs.push(toDataUrl(src).then((d) => cl.setAttribute("src", d)));
    } else if (tag === "canvas") {
      try {
        const img = document.createElement("img");
        img.src = el.toDataURL("image/png");
        img.setAttribute("style", cl.getAttribute("style") || "");
        cl.replaceWith(img);
      } catch {
        /* tainted canvas — leave the empty box */
      }
    } else if (tag === "video") {
      try {
        const c = document.createElement("canvas");
        c.width = el.videoWidth;
        c.height = el.videoHeight;
        c.getContext("2d").drawImage(el, 0, 0);
        const img = document.createElement("img");
        img.src = c.toDataURL("image/jpeg", 0.85);
        img.setAttribute("style", cl.getAttribute("style") || "");
        cl.replaceWith(img);
      } catch {
        if (el.poster) bgJobs.push(toDataUrl(el.poster).then((d) => cl.setAttribute("poster", d)));
      }
    } else if (tag === "input") {
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) cl.setAttribute("checked", "");
      } else cl.setAttribute("value", el.value);
    } else if (tag === "textarea") {
      cl.textContent = el.value;
    } else if (tag === "select") {
      [...cl.options].forEach((o, k) => o.toggleAttribute("selected", k === el.selectedIndex));
    } else if (tag === "image" || tag === "use") {
      const href = el.getAttribute("href") || el.getAttribute("xlink:href");
      if (href && !href.startsWith("#")) bgJobs.push(toDataUrl(href).then((d) => cl.setAttribute("href", d)));
    }
  }

  sandbox.remove();
  clone.querySelectorAll("iframe, nextjs-portal").forEach((n) => n.remove());

  // @font-face for every family actually rendered, with font files inlined.
  const used = new Set();
  for (const el of originals) {
    getComputedStyle(el)
      .fontFamily.split(",")
      .forEach((f) => used.add(f.trim().replace(/^['"]|['"]$/g, "")));
  }
  const fontRules = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule) {
        const fam = r.style.getPropertyValue("font-family").trim().replace(/^['"]|['"]$/g, "");
        if (used.has(fam)) {
          const base = sheet.href || location.href;
          fontRules.push(
            inlineUrls(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q, u) => `url(${new URL(u, base).href})`)),
          );
        }
      }
    }
  }

  await Promise.all(bgJobs);
  const css = (await Promise.all(fontRules)).join("\n") + "\n" + (await Promise.all(pseudoRules)).join("\n");

  const head = clone.querySelector("head");
  head.querySelectorAll("meta[name=viewport]").forEach((m) => m.remove());
  head.insertAdjacentHTML(
    "afterbegin",
    `<meta charset="utf-8"><meta name="viewport" content="width=${innerWidth}">` +
      `<meta name="figma-export-source" content="${location.pathname + location.search}">`,
  );
  const style = document.createElement("style");
  style.textContent = css;
  head.appendChild(style);
  return "<!doctype html>\n" + clone.outerHTML;
};
