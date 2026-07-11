(function () {
  const BTN_ID = "wardrobe-clipper-fab";
  const TOAST_ID = "wardrobe-clipper-toast";

  // Never inject into the Wardrobe app itself (layout / UX noise).
  const host = location.hostname;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "wardrobe-app-lilac-two.vercel.app"
  ) {
    return;
  }

  function looksLikeProductPage() {
    try {
      const og = document.querySelector('meta[property="og:type"]');
      const ogType = (og?.getAttribute("content") || "").toLowerCase();
      if (ogType.includes("product")) return true;

      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      for (const el of scripts) {
        const raw = el.textContent || "";
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          const nodes = Array.isArray(data) ? data : [data];
          for (const node of nodes) {
            const t = node?.["@type"];
            const types = Array.isArray(t) ? t : [t];
            if (types.some((x) => String(x).toLowerCase() === "product")) {
              return true;
            }
            if (Array.isArray(node?.["@graph"])) {
              for (const g of node["@graph"]) {
                const gt = g?.["@type"];
                const gtypes = Array.isArray(gt) ? gt : [gt];
                if (gtypes.some((x) => String(x).toLowerCase() === "product")) {
                  return true;
                }
              }
            }
          }
        } catch {
          /* ignore bad JSON-LD */
        }
      }

      const path = location.pathname.toLowerCase();
      return /\/(product|products|p|dp|itm|ip)\b/.test(path);
    } catch {
      return false;
    }
  }

  function showToast(text, ok) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      document.documentElement.appendChild(el);
    }
    el.textContent = text;
    el.dataset.ok = ok ? "1" : "0";
    el.dataset.show = "1";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.dataset.show = "0";
    }, 3200);
  }

  function ensureFab() {
    if (document.getElementById(BTN_ID)) return;
    if (!looksLikeProductPage()) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Save to Wardrobe";
    btn.title = "Save this product to your Wardrobe wishlist (⌥⇧W)";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "Saving…";
      chrome.runtime.sendMessage(
        {
          type: "WARDROBE_SAVE_PAGE",
          url: location.href,
          title: document.title,
        },
        (result) => {
          const err = chrome.runtime.lastError;
          btn.disabled = false;
          btn.textContent = "Save to Wardrobe";
          if (err) {
            showToast(err.message || "Extension error", false);
            return;
          }
          if (!result) {
            showToast("No response from extension", false);
            return;
          }
          showToast(result.message || (result.ok ? "Saved" : "Failed"), result.ok);
        },
      );
    });
    document.documentElement.appendChild(btn);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "WARDROBE_SAVE_RESULT") {
      showToast(
        message.message || (message.ok ? "Saved" : "Failed"),
        Boolean(message.ok),
      );
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFab);
  } else {
    ensureFab();
  }

  // SPA product pages often hydrate late
  setTimeout(ensureFab, 1500);
  setTimeout(ensureFab, 4000);
})();
