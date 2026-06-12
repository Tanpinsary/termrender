import type { TermlessTheme } from "./types"
import { DEFAULT_THEME } from "./types"
import { parseOmpTheme } from "./omp"
import { parseOmzTheme } from "./omz"
import { parseIterm2Theme } from "./iterm2"

export type ThemeFormat = "omp" | "omz" | "iterm2" | "auto"

function detectFormat(filepath: string, raw: string): ThemeFormat {
  const ext = filepath.split(".").pop()?.toLowerCase()
  const trimmed = raw.trim()

  if (ext === "itermcolors" || ext === "plist") return "iterm2"
  if (ext === "zsh-theme" || filepath.endsWith(".zsh")) return "omz"

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<plist")) return "iterm2"
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "omp"

  if (trimmed.includes("\x1b[") || trimmed.includes("PROMPT=") || trimmed.includes("RPROMPT="))
    return "omz"

  return "omp"
}

export async function loadTheme(
  raw: string,
  filepath: string = "",
  format: ThemeFormat = "auto",
): Promise<TermlessTheme> {
  const detected = format === "auto" ? detectFormat(filepath, raw) : format

  switch (detected) {
    case "omp":
      return parseOmpTheme(raw)
    case "omz":
      return parseOmzTheme(raw)
    case "iterm2":
      return parseIterm2Theme(raw)
    default:
      return DEFAULT_THEME
  }
}

export type { TermlessTheme }
export { parseOmpTheme, parseOmzTheme, parseIterm2Theme, DEFAULT_THEME }
