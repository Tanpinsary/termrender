#!/usr/bin/env bash
# Generate demo screenshots for README
# All demos use `exec` for real prompt + real command output
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets

echo "=== Generating demo-basic.png ==="
bun run bin/termrender.ts exec \
  --theme auto --window-bar rings -o assets/demo-basic.png \
  -- echo "Hello, termrender!"

echo "=== Generating demo-highlight.png ==="
# Git repo required for meaningful command output; use the project itself
bun run bin/termrender.ts exec \
  --theme auto --window-bar rings -o assets/demo-highlight.png \
  -- git log --oneline -5

echo "=== Generating demo-theme.png ==="
bun run bin/termrender.ts exec \
  --theme auto --window-bar rings -o assets/demo-theme.png \
  -- ls -la

echo "=== Generating demo-windowbar.png ==="
bun run bin/termrender.ts exec \
  --theme auto --window-bar colorful -o assets/demo-windowbar.png \
  -- echo "termrender"

echo "=== Generating demo-omz.png ==="
bun run bin/termrender.ts exec \
  --prompt zsh --theme auto --window-bar rings -o assets/demo-omz.png \
  -- git log --oneline -5

echo "All demo images generated!"
