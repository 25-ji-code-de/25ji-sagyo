#!/bin/bash
# Cloudflare Pages Build Script
# This script runs during Cloudflare Pages build process

# Get commit info from environment (Cloudflare provides these)
COMMIT_SHA=${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "unknown")}
SHORT_SHA=${COMMIT_SHA:0:7}
BUILD_DATE=$(date +%Y.%m.%d)

# Inject version directly into script.js
# This ensures version is always in sync with the JS file itself
sed -i "s/__BUILD_VERSION__/${SHORT_SHA}/g" js/components/settings-panel.js
sed -i "s/__BUILD_DATE__/${BUILD_DATE}/g" js/components/settings-panel.js
sed -i "s/__BUILD_FULL_SHA__/${COMMIT_SHA}/g" js/components/settings-panel.js

echo "Injected version into settings-panel.js: ${BUILD_DATE} (${SHORT_SHA})"
