const DEFAULT_ORIGIN = "https://wardrobe-app-lilac-two.vercel.app";

const MENU_SAVE = "wardrobe-save-wishlist";
const MENU_SETTINGS = "wardrobe-open-settings";

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

async function getOrigin() {
  const data = await storageGet(["appOrigin"]);
  return data.appOrigin || DEFAULT_ORIGIN;
}

async function getAuth() {
  return storageGet(["accessToken", "email", "expiresAt"]);
}

async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" }).catch(() => {});
    }, 2200);
  } catch {
    /* ignore */
  }
}

async function openConnect() {
  const origin = await getOrigin();
  const url = `${origin}/extension/connect?ext=${encodeURIComponent(chrome.runtime.id)}`;
  await chrome.tabs.create({ url });
}

async function openSettings() {
  await chrome.runtime.openOptionsPage();
}

/**
 * Save a URL to the Wardrobe wishlist via /api/clip.
 * @returns {{ ok: boolean, message: string, duplicate?: boolean }}
 */
async function saveUrl(url, title) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, message: "Open a normal web page first." };
  }

  const auth = await getAuth();
  if (!auth.accessToken) {
    await openConnect();
    return { ok: false, message: "Connect your account first." };
  }

  const origin = await getOrigin();
  let res;
  try {
    res = await fetch(`${origin}/api/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ url, title: title || "" }),
    });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    await storageRemove(["accessToken", "email", "expiresAt"]);
    await openConnect();
    return { ok: false, message: "Session expired — reconnect." };
  }

  if (!res.ok) {
    return {
      ok: false,
      message: data.error || `Save failed (${res.status})`,
    };
  }

  const name = data.item?.name || "wishlist item";
  if (data.duplicate) {
    await flashBadge("•", "#78716c");
    return { ok: true, duplicate: true, message: `Already saved: ${name}` };
  }

  await flashBadge("✓", "#166534");
  return { ok: true, message: `Saved: ${name}` };
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return saveUrl(tab?.url || "", tab?.title || "");
}

async function notifyTab(tabId, result) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "WARDROBE_SAVE_RESULT",
      ...result,
    });
  } catch {
    /* no content script (chrome:// etc.) */
  }
}

function ensureMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE,
      title: "Save to Wardrobe wishlist",
      contexts: ["page", "link", "image", "selection"],
    });
    chrome.contextMenus.create({
      id: MENU_SETTINGS,
      title: "Wardrobe clipper settings",
      contexts: ["action"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureMenus();
});

chrome.runtime.onStartup.addListener(() => {
  ensureMenus();
});

// One-click toolbar icon → save (no popup on happy path)
chrome.action.onClicked.addListener(async (tab) => {
  const auth = await getAuth();
  if (!auth.accessToken) {
    await openSettings();
    await openConnect();
    return;
  }
  const result = await saveUrl(tab?.url || "", tab?.title || "");
  await notifyTab(tab?.id, result);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-clipper-settings") {
    await openSettings();
    return;
  }
  if (command === "save-to-wishlist") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const result = await saveActiveTab();
    await notifyTab(tab?.id, result);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_SETTINGS) {
    await openSettings();
    return;
  }
  if (info.menuItemId !== MENU_SAVE) return;

  const url = info.linkUrl || info.srcUrl || tab?.url || "";
  const title = tab?.title || "";
  const result = await saveUrl(url, title);
  await notifyTab(tab?.id, result);
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "WARDROBE_AUTH") {
    sendResponse({ ok: false, error: "Unknown message" });
    return false;
  }
  const accessToken = String(message.accessToken || "");
  if (!accessToken) {
    sendResponse({ ok: false, error: "Missing token" });
    return false;
  }
  chrome.storage.local.set(
    {
      accessToken,
      email: String(message.email || ""),
      expiresAt: message.expiresAt ?? null,
      connectedAt: Date.now(),
    },
    () => sendResponse({ ok: true }),
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "WARDROBE_SAVE_PAGE") {
    const url = message.url || sender.tab?.url || "";
    const title = message.title || sender.tab?.title || "";
    saveUrl(url, title).then((result) => {
      sendResponse(result);
      notifyTab(sender.tab?.id, result);
    });
    return true;
  }

  if (message.type === "WARDROBE_OPEN_SETTINGS") {
    openSettings().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "WARDROBE_GET_STATUS") {
    Promise.all([getAuth(), getOrigin()]).then(([auth, origin]) => {
      sendResponse({
        connected: Boolean(auth.accessToken),
        email: auth.email || "",
        origin,
      });
    });
    return true;
  }

  return false;
});
