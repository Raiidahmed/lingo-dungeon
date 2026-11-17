#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting Lingo Dungeon ==="

cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  npm install -q
fi
exec npm run dev
