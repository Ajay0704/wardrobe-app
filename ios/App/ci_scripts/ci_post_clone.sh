#!/bin/sh

# Xcode Cloud runs this automatically after cloning the repository, before it
# resolves Swift packages and builds.
#
# Why it exists: this app is Capacitor 8 on Swift Package Manager. The generated
# ios/App/CapApp-SPM/Package.swift references every plugin by a LOCAL path under
# node_modules/@capacitor/* (e.g. ../../../node_modules/@capacitor/camera).
# node_modules is gitignored, so after a clean clone those packages don't exist
# and SPM fails with "the package at '.../node_modules/@capacitor/...' cannot be
# accessed". Installing the JS dependencies here makes them resolvable before
# xcodebuild runs.
#
# Note: capacitor.config.ts uses server.url (the live Vercel URL), so the native
# app loads the web app remotely — there is no need to run `next build` or supply
# any web/build secrets here. We only need the native plugin packages present.

set -e

# Xcode Cloud clones the primary repo to $CI_PRIMARY_REPOSITORY_PATH and runs
# this script from ios/App/ci_scripts. Operate from the repo root.
cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "▸ Installing Node.js (node@20) via Homebrew"
brew install node@20
brew link --overwrite --force node@20
echo "▸ Using $(node -v) / npm $(npm -v)"

echo "▸ Installing JS dependencies (populates node_modules/@capacitor/*)"
npm config set maxsockets 3   # documented Xcode Cloud npm network-flakiness workaround
npm ci

echo "▸ Syncing Capacitor iOS (copies web assets + wires plugin packages)"
npx cap sync ios

echo "▸ ci_post_clone complete"
