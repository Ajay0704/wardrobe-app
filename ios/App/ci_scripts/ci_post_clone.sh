#!/bin/sh

# Xcode Cloud runs this automatically after cloning the repository, before it
# resolves Swift packages and builds.
#
# Why it exists: this app is Capacitor 8 on Swift Package Manager. The generated
# ios/App/CapApp-SPM/Package.swift references every plugin by a LOCAL path under
# node_modules/@capacitor/* (e.g. ../../../node_modules/@capacitor/camera).
# node_modules is gitignored, so after a clean clone those packages don't exist
# and SPM fails with "the package at '.../node_modules/@capacitor/...' cannot be
# accessed". We install the JS deps here so they resolve before xcodebuild runs.
#
# Two other gitignored, Xcode-referenced files must also be regenerated or the
# "Copy Bundle Resources" phase later fails: ios/App/App/public (the web assets)
# and ios/App/App/capacitor.config.json. `cap copy` produces both. We use `copy`
# (not `sync`) on purpose: `sync` also runs `update`, which touches native deps
# and is a needless failure point on CI. capacitor.config.ts defaults server.url
# to the live Vercel app, so no web build or secrets are needed here.

# -e: stop on first error.  -x: trace every command so a failure in Xcode Cloud's
# log names the exact line that failed.
set -ex

# --- Make sure Homebrew (and therefore Node) is on PATH. Xcode Cloud's Apple-
#     silicon runners install Homebrew at /opt/homebrew; older Intel at /usr/local.
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

brew install node@20
# node@20 is keg-only, so put it on PATH directly rather than relying on the
# `brew link` step (which can conflict and abort under `set -e`).
export PATH="$(brew --prefix node@20)/bin:$PATH"
node -v
npm -v

# --- Install JS dependencies (populates node_modules/@capacitor/* for SPM). ---
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm config set maxsockets 3   # documented Xcode Cloud npm network-flakiness workaround
npm ci

# --- Generate the gitignored native web assets + capacitor.config.json. ---
./node_modules/.bin/cap copy ios

# --- Fail loudly here (with a clear message) if anything the build needs is
#     still missing, rather than deep inside xcodebuild.
ls -d node_modules/@capacitor >/dev/null
ls -d ios/App/App/public >/dev/null
ls ios/App/App/capacitor.config.json >/dev/null

echo "▸ ci_post_clone complete"
