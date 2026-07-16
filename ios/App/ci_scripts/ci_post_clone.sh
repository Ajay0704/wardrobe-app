#!/bin/sh

# Xcode Cloud runs this automatically after cloning the repository, before it
# resolves Swift packages and builds.
#
# Why it exists: this app is Capacitor 8 on Swift Package Manager. The generated
# ios/App/CapApp-SPM/Package.swift references every plugin by a LOCAL path under
# node_modules/@capacitor/* (e.g. ../../../node_modules/@capacitor/camera).
# node_modules is gitignored, so after a clean clone those packages don't exist
# and SPM fails with "the package at '.../node_modules/@capacitor/...' cannot be
# accessed". Installing the JS deps here makes them resolvable before xcodebuild.
#
# The two web-asset resources the Xcode project bundles (ios/App/App/public and
# ios/App/App/capacitor.config.json) are now committed, so this script only has
# to guarantee node_modules exists; regenerating them via `cap copy` is a
# best-effort refresh.

# -e: stop on first error.  -x: trace every command so a failure in Xcode Cloud's
# log names the exact line that failed.
set -ex

# Resolve the repo root from THIS script's location (ios/App/ci_scripts/…), not
# from an env var — cd "" is a silent no-op on macOS /bin/sh and would leave us
# running npm in the wrong directory.
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO"

# --- Make sure Homebrew is on PATH. Apple-silicon runners use /opt/homebrew,
#     older Intel runners /usr/local. ---
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

# --- Node: use whatever's already on the runner, else install Node 20. ---
if ! command -v node >/dev/null 2>&1; then
  brew install node@20
fi
# If node@20 is installed (keg-only), put it on PATH directly.
NODE20_BIN="$(brew --prefix node@20 2>/dev/null)/bin"
if [ -d "$NODE20_BIN" ]; then
  export PATH="$NODE20_BIN:$PATH"
fi
node -v
npm -v

# --- Install JS deps so node_modules/@capacitor/* exist for SPM. Include dev
#     deps (Capacitor CLI); fall back to `npm install` if `npm ci` can't run. ---
npm config set maxsockets 3
npm ci --include=dev || npm install --include=dev

# Hard requirement: SPM cannot resolve without these.
if [ ! -d node_modules/@capacitor ]; then
  echo "FATAL: node_modules/@capacitor missing after install"
  exit 1
fi

# --- Best-effort refresh of the committed web assets + config. A CLI hiccup
#     here must NOT fail the archive — the committed files already satisfy it. ---
if [ -x node_modules/.bin/cap ]; then
  node_modules/.bin/cap copy ios || echo "cap copy failed; using committed ios/App/App resources"
else
  echo "cap CLI not installed; using committed ios/App/App resources"
fi

echo "▸ ci_post_clone complete"
