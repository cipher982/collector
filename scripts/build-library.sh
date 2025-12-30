#!/usr/bin/env bash
# Build visitor context library and copy to static/v1/ for Docker deployment

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building visitor context library..."
cd lib
bun install --frozen-lockfile 2>/dev/null || npm install --frozen-lockfile
bun run build

echo "Copying built library to static/v1/..."
cd ..
mkdir -p static/v1
cp lib/dist/index.min.js static/v1/context.min.js
cp lib/dist/index.min.js.map static/v1/context.min.js.map

echo "✓ Library built and copied to static/v1/context.min.js"
ls -lh static/v1/context.min.js
