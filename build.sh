#!/bin/bash
# Cloudflare Pages Build Script
# This script runs during Cloudflare Pages build process

# Get commit info from environment (Cloudflare provides these)
COMMIT_SHA=${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo "unknown")}
SHORT_SHA=${COMMIT_SHA:0:7}
BUILD_DATE=$(date +%Y.%m.%d)

# Inject version directly into script.js
# This ensures version is always in sync with the JS file itself
sed -i "s/__BUILD_VERSION__/${SHORT_SHA}/g" script.js
sed -i "s/__BUILD_DATE__/${BUILD_DATE}/g" script.js
sed -i "s/__BUILD_FULL_SHA__/${COMMIT_SHA}/g" script.js

echo "Injected version into script.js: ${BUILD_DATE} (${SHORT_SHA})"
