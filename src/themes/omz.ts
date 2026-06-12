import type { TermlessTheme } from "./types"
import { ANSI_FALLBACK_PALETTE, DEFAULT_THEME } from "./types"

const HEX_COLOR_RE = /#([0-9a-fA-F]{3,6})\b/g

function extractHexColors(script: string): string[] {
  const colors: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(HEX_COLOR_RE.source, "g")
  while ((match = re.exec(script)) !== null) {
    colors.push(`#${match[1].toLowerCase()}`)
  }
  return [...new Set(colors)]
}

export function parseOmzTheme(script: string): TermlessTheme {
  const hexColors = extractHexColors(script)

  const palette: Record<number, string> = { ...ANSI_FALLBACK_PALETTE }

  let foreground = DEFAULT_THEME.foreground
  let background = DEFAULT_THEME.background

  if (hexColors.length > 0) {
    foreground = hexColors[0]

    if (hexColors.length > 1) {
      background = hexColors[hexColors.length - 1]
    }

    hexColors.slice(0, 16).forEach((hex, i) => {
      if (i < 16) palette[i] = hex
    })
  }

  return {
    name: "omz",
    foreground,
    background,
    cursor: palette[7] ?? DEFAULT_THEME.cursor,
    palette,
  }
}
