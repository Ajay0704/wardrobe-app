const DEFAULT_ORIGIN = "https://wardrobe-app-lilac-two.vercel.app";

const accountEl = document.getElementById("account");
const statusEl = document.getElementById("status");
const originEl = document.getElementById("origin");
const connectBtn = document.getElementById("connect");
const disconnectBtn = document.getElementById("disconnect");

function setStatus(text, kind) {
  statusEl.hidden = !text;
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function loadOrigin() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["appOrigin"], (data) => {
      const origin = data.appOrigin || DEFAULT_ORIGIN;
      originEl.value = origin;
      resolve(origin);
    });
  });
}

function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["accessToken", "email", "expiresAt"],
      (data) => resolve(data),
    );
  });
}

function refreshAccountUi(auth) {
  if (auth.accessToken) {
    accountEl.textContent = auth.email
      ? `Connected as ${auth.email}`
      : "Connected";
    disconnectBtn.hidden = false;
    connectBtn.textContent = "Reconnect";
  } else {
    accountEl.textContent = "Not connected";
    disconnectBtn.hidden = true;
    connectBtn.textContent = "Connect account";
  }
}

async function init() {
  await loadOrigin();
  refreshAccountUi(await getAuth());
}

originEl.addEventListener("change", () => {
  chrome.storage.local.set({ appOrigin: originEl.value });
  setStatus("App target saved.", "ok");
});

connectBtn.addEventListener("click", async () => {
  const origin = originEl.value || DEFAULT_ORIGIN;
  chrome.storage.local.set({ appOrigin: origin });
  const url = `${origin}/extension/connect?ext=${encodeURIComponent(chrome.runtime.id)}`;
  await chrome.tabs.create({ url });
});

disconnectBtn.addEventListener("click", () => {
  chrome.storage.local.remove(
    ["accessToken", "email", "expiresAt", "connectedAt"],
    async () => {
      refreshAccountUi({});
      setStatus("Disconnected.", "ok");
    },
  );
});

void init();
