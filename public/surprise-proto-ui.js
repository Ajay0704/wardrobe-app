/* AJA-248 prototype UI. Wrapped in an IIFE: both this and surprise-proto.js
 * are classic scripts sharing one global scope, and a top-level `const SEASONS`
 * in each killed this whole file with a redeclaration SyntaxError. */
(() => {
const P = window.SurpriseProto;
const $ = (id) => document.getElementById(id);

// ---- load the closet from the app's own localStorage; nothing is bundled here ----
let owned = [];
function loadCloset() {
  try {
    const raw = localStorage.getItem("wardrobe-store-v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const items = parsed?.state?.items ?? parsed?.items;
    if (!Array.isArray(items)) return null;
    return items.filter((i) => i && !i.wishlist && i.imageUrl);
  } catch { return null; }
}
function setCloset(list) {
  owned = list;
  $("sub").innerHTML = `<b>${owned.length}</b> owned items with an image · read from this origin's localStorage · nothing is stored in this page`;
}

const found = loadCloset();
if (found && found.length >= 8) {
  setCloset(found);
} else {
  const b = $("banner");
  b.hidden = false;
  b.classList.add("err");
  b.innerHTML = `No closet found in <code>localStorage["wardrobe-store-v2"]</code> on this origin.
    Open this page on the same origin as the app (the deployed app, or <code>localhost:3000</code>) so it can read your real closet —
    or paste a closet JSON array below.
    <textarea id="paste" placeholder='[{"id":"…","name":"…","category":"top", …}]'></textarea>`;
  b.querySelector("#paste").addEventListener("input", (e) => {
    try {
      const arr = JSON.parse(e.target.value);
      if (Array.isArray(arr) && arr.length >= 8) {
        setCloset(arr.filter((i) => i && !i.wishlist && i.imageUrl));
        b.hidden = true;
        run();
      }
    } catch {}
  });
}

// ---- context chips ----
const SEASONS = ["spring", "summer", "fall", "winter"];
const OCCASIONS = ["everyday", "work", "going out"];
let ctxState = { season: "summer", occasion: "everyday", tempC: 27, needsOuterwear: false };

function chips(host, list, key) {
  $(host).innerHTML = list.map((v) =>
    `<button class="chip" data-v="${v}" aria-pressed="${ctxState[key] === v}">${v}</button>`).join("");
  $(host).querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    ctxState[key] = c.dataset.v;
    chips(host, list, key);
    run();
  }));
}
chips("seasons", SEASONS, "season");
chips("occasions", OCCASIONS, "occasion");
$("temp").addEventListener("input", (e) => {
  ctxState.tempC = +e.target.value;
  $("tempv").textContent = ctxState.tempC + "°C";
});
$("temp").addEventListener("change", run);
$("coat").addEventListener("click", () => {
  ctxState.needsOuterwear = !ctxState.needsOuterwear;
  $("coat").setAttribute("aria-pressed", String(ctxState.needsOuterwear));
  run();
});
$("go").addEventListener("click", () => { seed = (seed + 977) | 0; run(); });

// ---- rendering ----
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function itemCard(it) {
  const d = P.dressiness(it);
  return `<div class="it">
    <div class="ph">${it.imageUrl ? `<img loading="lazy" src="${esc(it.imageUrl)}" alt="">` : ""}</div>
    <div class="nm">${esc(it.name)}</div>
    <div class="at"><span class="swatch" style="background:${esc(it.color || "#888")}"></span>${esc(it.subcategory || it.category)}${d !== null ? ` · d${d}` : ""}</div>
  </div>`;
}

function lookCard(look, kind) {
  const slotCls = kind === "old" ? "old" : look.slot;
  const label = kind === "old" ? "Current" : look.slot;
  const blurb = kind === "old" ? "single best of 18 samples" : look.blurb;
  const sig = look.signals ? `<div class="sig">${Object.entries(look.signals)
    .map(([k, v]) => `<span>${k} ${v.toFixed(2)}</span>`).join("")}</div>` : "";
  const why = look.reasons && look.reasons.length
    ? `<div class="why">${look.reasons.map((r) => `<div><b>${esc(r.k)}</b>${esc(r.why)}</div>`).join("")}</div>`
    : "";
  return `<div class="look ${kind === "old" ? "now" : ""}">
    <div class="lhead">
      <span class="slot ${slotCls}">${esc(label)}</span>
      <span class="blurb">${esc(blurb)}</span>
      <span class="score">${look.score}/100</span>
    </div>
    <div class="row">${look.items.map(itemCard).join("")}</div>
    ${why}${sig}
  </div>`;
}

let seed = 1;
function run() {
  if (!owned.length) return;
  const ctx = { ...ctxState };

  // Current engine — the faithful port (verified against src/lib/matching.ts).
  const old = P.currentEngine(owned, P.mulberry32(seed));
  $("now").innerHTML = old
    ? lookCard(old, "old") +
      `<div class="note">Ignores every chip above — the shipped call passes an empty options object,
       so season, temperature and occasion never reach the engine.</div>`
    : `<div class="empty">No look produced.</div>`;

  // Proposed engine.
  const { slate, candidates } = P.proposedEngine(owned, ctx, P.mulberry32(seed), 500);
  $("new").innerHTML = slate.length
    ? slate.map((l) => lookCard(l, "new")).join("")
    : `<div class="empty">Every candidate was filtered out for this context. Try another season.</div>`;

  // Diagnostics.
  const rej = candidates.filter((c) => c.rejected);
  const counts = new Map();
  for (const c of rej) counts.set(c.rejected, (counts.get(c.rejected) || 0) + 1);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const max = sorted.length ? sorted[0][1] : 1;
  $("rejects").innerHTML = sorted.length
    ? sorted.map(([r, n]) => `<div class="bar">
        <span class="lab">${esc(r)}</span>
        <span class="track"><span class="fill" style="width:${(n / max) * 100}%"></span></span>
        <span class="n">${n}</span></div>`).join("")
    : `<div class="empty">Nothing rejected this run.</div>`;
  $("dnote").textContent =
    `${candidates.length} candidates generated, ${rej.length} rejected (${Math.round(rej.length / candidates.length * 100)}%), ` +
    `${candidates.length - rej.length} scored. The shipped engine applies none of these filters — ` +
    `it samples 18 outfits weighted by colour and recency only, then keeps the highest scorer.`;
}
run();

})();
