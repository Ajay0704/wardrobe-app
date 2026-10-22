#!/bin/sh

# Xcode Cloud runs this automatically right before `xcodebuild`, after it has
# resolved packages. Its one job: stamp a UNIQUE, ALWAYS-INCREASING build number
# so every TestFlight upload is accepted.
#
# Why this is needed to stay in TestFlight:
#   The iOS app is a Capacitor shell that loads the live Vercel site, so web and
#   feature changes reach testers automatically on each deploy. The only thing
#   that pulls the app from TestFlight is the 90-day build expiry — a fresh build
#   must be uploaded before then. But App Store Connect rejects any build whose
#   number is not HIGHER than the last upload for the same marketing version, and
#   CURRENT_PROJECT_VERSION is pinned in project.pbxproj (it was 5). Without this
#   script the keep-alive re-upload fails with "build number already used", and
#   the app eventually expires out of TestFlight with no way to post a replacement.
#
# Scheme: a UTC timestamp YYMMDDHHMM (e.g. 2026-10-15 14:32 UTC -> 2610151432).
#   - always larger than the old integer builds (…5),
#   - strictly increases every minute, so re-runs never collide,
#   - a single integer within CFBundleVersion's 32-bit component limit until ~2042.
# Applied to BOTH targets (App + ShareExtension); Apple requires the extension's
# build number to match the app's.

# -e: stop on first error.  -x: trace, so an Xcode Cloud log names the failing line.
set -ex

# Only rewrite inside Xcode Cloud. A local `xcodebuild`/Archive keeps whatever is
# committed, so this never surprises a developer building on their Mac.
if [ "$CI" != "TRUE" ]; then
  echo "ci_pre_xcodebuild: not Xcode Cloud (CI != TRUE) — leaving build number as committed"
  exit 0
fi

BUILD_NUMBER="$(date -u +%y%m%d%H%M)"

# Resolve the repo root from THIS script's location (ios/App/ci_scripts/…).
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
PBXPROJ="$REPO/ios/App/App.xcodeproj/project.pbxproj"

# Rewrite every CURRENT_PROJECT_VERSION (App + ShareExtension, Debug + Release).
# Info.plist reads $(CURRENT_PROJECT_VERSION), so changing the build setting is
# enough — no plist edit required. BSD sed (macOS runners) needs the empty -i arg.
sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9.]+;/CURRENT_PROJECT_VERSION = ${BUILD_NUMBER};/g" "$PBXPROJ"

echo "▸ ci_pre_xcodebuild: build number set to ${BUILD_NUMBER}"
grep -n "CURRENT_PROJECT_VERSION" "$PBXPROJ" || true
