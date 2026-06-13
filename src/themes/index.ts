import type { TermlessTheme } from "./types"
import { DEFAULT_THEME } from "./types"
import { DEFAULT_LIGHT_THEME } from "./types"
import { parseIterm2Theme } from "./iterm2"

export type ThemeFormat = "iterm2" | "auto"

function detectFormat(filepath: string, raw: string): ThemeFormat {
  const ext = filepath.split(".").pop()?.toLowerCase()
  const trimmed = raw.trim()

  if (ext === "itermcolors" || ext === "plist") return "iterm2"

  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<plist")) return "iterm2"

  return "iterm2"
}

export async function loadTheme(
  raw: string,
  filepath: string = "",
  format: ThemeFormat = "auto",
): Promise<TermlessTheme> {
  const detected = format === "auto" ? detectFormat(filepath, raw) : format

  switch (detected) {
    case "iterm2":
      return parseIterm2Theme(raw)
    default:
      return DEFAULT_THEME
  }
}

export function getSystemTheme(): TermlessTheme {
  try {
    const result = Bun.spawnSync(["defaults", "read", "-g", "AppleInterfaceStyle"])
    const style = result.stdout.toString().trim()
    if (style === "Dark") {
      return DEFAULT_THEME
    }
    return DEFAULT_LIGHT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export type { TermlessTheme }
export { parseIterm2Theme, DEFAULT_THEME, DEFAULT_LIGHT_THEME }
