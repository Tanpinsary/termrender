#!/usr/bin/env bash
# Terminal compatibility test suite for termrender
# Tests prompt rendering, themes, and command highlighting

set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p test/output

FAIL=0
PASS=0

check() {
  local name="$1"
  local cmd="$2"
  shift 2
  echo "=== $name ==="
  if eval "$cmd" "$@"; then
    PASS=$((PASS + 1))
    echo "✅ PASS"
  else
    FAIL=$((FAIL + 1))
    echo "❌ FAIL"
  fi
  echo
}

# 1. Prompt rendering tests
# ----------------------------------------------------------------------------

check "fish prompt" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/fish-prompt.png -- echo 'hello'"

check "zsh prompt" \
  "bun run bin/termrender.ts exec --prompt zsh --window-bar rings -o test/output/zsh-prompt.png -- echo 'hello'"

check "no prompt" \
  "bun run bin/termrender.ts exec --prompt none --window-bar rings -o test/output/no-prompt.png -- echo 'hello'"

check "auto prompt (detect shell)" \
  "bun run bin/termrender.ts exec --prompt auto --window-bar rings -o test/output/auto-prompt.png -- echo 'hello'"

# 2. Theme tests
# ----------------------------------------------------------------------------

check "default theme" \
  "bun run bin/termrender.ts exec --window-bar rings -o test/output/default-theme.png -- echo 'hello'"

check "live iTerm2 profile (auto)" \
  "bun run bin/termrender.ts exec --theme auto --window-bar rings -o test/output/live-theme.png -- echo 'hello'"

# 3. Command highlighting tests
# ----------------------------------------------------------------------------

check "highlight: basic command (git log --oneline -3)" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/hl-basic.png -- git log --oneline -3"

check "highlight: pipe (ls | grep foo)" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/hl-pipe.png -- bash -c 'ls | grep bin'"

check "highlight: redirection (echo hello > test/output/redirect.txt)" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/hl-redirect.png -- bash -c 'echo hello > test/output/redirect.txt'"

check "highlight: operator (&&)" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/hl-operator.png -- bash -c 'echo hello && echo world'"

check "highlight: end-of-options (-- HEAD)" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/hl-endopts.png -- git log -- HEAD --oneline -1"

# 4. Edge cases
# ----------------------------------------------------------------------------

check "empty command" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/empty-cmd.png -- bash -c ''"

check "single word command" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/single-word.png -- ls"

check "command with spaces" \
  "bun run bin/termrender.ts exec --prompt fish --window-bar rings -o test/output/spaces.png -- echo 'hello world with spaces'"

check "cwd option" \
  "bun run bin/termrender.ts exec --prompt fish --cwd /tmp --window-bar rings -o test/output/cwd.png -- pwd"

# 5. Summary
# ----------------------------------------------------------------------------
echo "================================"
echo "Results: $PASS passed, $FAIL failed"

if [ $FAIL -gt 0 ]; then
  echo "⚠️  Some tests failed. Check test/output/ for generated screenshots."
  exit 1
fi

echo "🎉 All tests passed! Screenshots saved to test/output/"
