#!/usr/bin/env bash
# Generate demo screenshots for README
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets

echo "=== Generating demo-basic.png ==="
# Basic demo: prompt + command + output
printf '\033[90mTanpinsary@tanpinsary> \033[0m\033[36mecho\033[0m \033[32m"Hello, termrender!"\033[0m\n\033[33mHello, termrender!\033[0m\n' | \
  bun run bin/termrender.ts render --window-bar rings --rows 3 -o assets/demo-basic.png

echo "=== Generating demo-theme.png ==="
# System theme demo: ls -la in project directory
bun run bin/termrender.ts exec --cwd "$(pwd)" --window-bar rings --rows 15 -o assets/demo-theme.png -- ls -la

echo "=== Generating demo-highlight.png ==="
# Command highlighting demo: prompt + command with highlighting
printf '\033[90mTanpinsary@tanpinsary> \033[0m\033[36mgit\033[0m \033[36mlog\033[0m \033[36m--oneline\033[0m \033[35m|\033[0m \033[36mhead\033[0m \033[36m-5\033[0m\n' | \
  bun run bin/termrender.ts render --window-bar rings --rows 2 -o assets/demo-highlight.png

echo "=== Generating demo-windowbar.png ==="
# Window bar style demo: colorful bar
printf '\033[90mTanpinsary@tanpinsary> \033[0m\033[36mls\033[0m \033[36m-la\033[0m\n' | \
  bun run bin/termrender.ts render --window-bar colorful --rows 2 -o assets/demo-windowbar.png

echo "=== Generating demo-syntax.png ==="
# Syntax highlighting demo (already updated, regenerate to ensure consistency)
printf '\033[90m> \033[0m\033[36mecho\033[0m \033[36mhello\033[0m \033[36mworld\033[0m \033[36m>\033[0m \033[36moutput.txt\033[0m' | \
  bun run bin/termrender.ts render --rows 1 --window-bar rings -o assets/demo-syntax.png

echo "All demo images generated!"
