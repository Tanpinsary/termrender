/**
 * Real-prompt acquisition.
 *
 * "Theme" files from Oh My Posh / Oh My Zsh are prompt definitions, not color
 * schemes — the only faithful way to replicate the user's prompt is to let the
 * prompt engine render it. This module shells out to the engine and captures
 * the raw ANSI it would print in the user's terminal:
 *
 *  - omp:  `oh-my-posh print primary --config <theme> --pwd <cwd>`
 *  - fish: `fish -c fish_prompt` (runs the user's own fish_prompt function)
 *  - zsh:  `zsh -ic 'print -rP "$PROMPT"'` (expands the interactive PROMPT)
 */

export type PromptMode = "auto" | "fish" | "zsh" | "none"

export interface PromptOptions {
  mode?: PromptMode
  /** Working directory the prompt should reflect (path segment, git status…). */
  cwd?: string
}

function run(argv: string[], cwd?: string): string | null {
  try {
    const proc = Bun.spawnSync(argv, { cwd, stderr: "ignore" })
    if (proc.exitCode !== 0) return null
    const out = proc.stdout.toString()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function hasCommand(name: string): boolean {
  return Bun.which(name) !== null
}

function fishPrompt(cwd: string): string | null {
  if (!hasCommand("fish")) return null
  // -i is required: fish only loads prompt color variables (fish_color_user,
  // fish_color_cwd, …) in interactive mode — without it the prompt renders
  // structurally correct but colorless.
  return run(["fish", "-i", "-c", `cd ${shellQuote(cwd)}; fish_prompt`], cwd)
}

function zshPrompt(cwd: string): string | null {
  if (!hasCommand("zsh")) return null
  const raw = run(
    [
      "zsh",
      "-ic",
      `cd ${shellQuote(cwd)} 2>/dev/null; ` +
        `(( \${+functions[_omz_git_prompt_info]} )) && git_prompt_info() { _omz_git_prompt_info }; ` +
        `print -rP "\$PS1"`,
    ],
    cwd,
  )
  if (!raw) return null
  // Some OMZ themes (e.g., af-magic) prepend a full-width dashed separator
  // line that's nearly invisible on dark backgrounds.  Strip the first line
  // when the prompt spans multiple lines.
  const nl = raw.indexOf("\n")
  return nl !== -1 ? raw.slice(nl + 1) : raw
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * The shell the user's terminal actually starts — NOT $SHELL, which reflects
 * the environment this process was launched from (an IDE or agent harness
 * often carries a different value than the user's real terminal).
 *
 * Resolution order:
 *  1. iTerm2 profile custom command (macOS, when the profile overrides the shell)
 *  2. the account's login shell from Directory Services (macOS)
 *  3. $SHELL as a last resort
 */
export function detectTerminalShell(): string | null {
  if (process.platform === "darwin") {
    const plist = `${process.env.HOME}/Library/Preferences/com.googlecode.iterm2.plist`
    const custom = run(["plutil", "-extract", "New Bookmarks.0.Custom Command", "raw", "-o", "-", plist])
    if (custom?.trim() === "Yes") {
      const cmd = run(["plutil", "-extract", "New Bookmarks.0.Command", "raw", "-o", "-", plist])
      const name = cmd?.trim().split(/\s+/)[0]?.split("/").pop()
      if (name) return name
    }
    const dscl = run(["dscl", ".", "-read", `/Users/${process.env.USER}`, "UserShell"])
    const m = dscl?.match(/UserShell:\s*(\S+)/)
    if (m) return m[1]!.split("/").pop() ?? null
  }
  return (process.env.SHELL ?? "").split("/").pop() || null
}

/**
 * Render the user's real prompt as a raw ANSI string, or null when no prompt
 * source is available. Trailing newlines are stripped (the prompt's own
 * internal newlines — multi-line prompts — are preserved).
 */
export function getPromptAnsi(options: PromptOptions = {}): string | null {
  const mode = options.mode ?? "auto"
  const cwd = options.cwd ?? process.cwd()

  let out: string | null = null
  switch (mode) {
    case "none":
      return null
    case "fish":
      out = fishPrompt(cwd)
      break
    case "zsh":
      out = zshPrompt(cwd)
      break
    case "auto": {
      const shell = detectTerminalShell()
      if (shell === "fish") out = fishPrompt(cwd)
      else if (shell === "zsh") out = zshPrompt(cwd)
      if (!out) out = fishPrompt(cwd) ?? zshPrompt(cwd)
      break
    }
  }

  if (!out) return null
  return out.replace(/\r?\n+$/, "")
}
