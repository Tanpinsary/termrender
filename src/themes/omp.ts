import type { TermlessTheme } from "./types"
import { ANSI_COLOR_NAMES, DEFAULT_THEME, normalizeHex } from "./types"
import { parse as yamlParse } from "yaml"

interface OmpPaletteEntry {
  color?: string
  foreground?: string
  background?: string
}

interface OmpTheme {
  $schema?: string
  palette?: Record<string, string> | string
  terminal_colors?: Record<string, string>
  palettes?: Record<string, OmpPaletteEntry>
  blocks?: Array<{
    type: string
    segments?: Array<{
      foreground?: string
      background?: string
      style?: string
    }>
  }>
}

function parseOmpContent(raw: string): OmpTheme {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed)
  }
  try {
    return yamlParse(trimmed) as OmpTheme
  } catch {
    try {
      const toml = Bun.TOML.parse(trimmed)
      return toml as OmpTheme
    } catch {
      throw new Error("Failed to parse OMP theme: expected JSON, YAML, or TOML")
    }
  }
}

function extractAnsiPalette(omp: OmpTheme): Record<number, string> {
  const palette: Record<number, string> = {}

  const source = omp.palette ?? omp.terminal_colors ?? {}

  if (typeof source === "string") {
    const colors = source.split(",").map((c) => c.trim()).filter(Boolean)
    colors.forEach((hex, i) => {
      if (i <= 15) palette[i] = normalizeHex(hex)
    })
    return palette
  }

  for (const [name, hex] of Object.entries(source)) {
    if (!hex) continue

    const parsedIdx = parseInt(name, 10)
    if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx <= 15) {
      palette[parsedIdx] = normalizeHex(String(hex))
      continue
    }

    const idx = ANSI_COLOR_NAMES[name]
    if (idx !== undefined) {
      palette[idx] = normalizeHex(String(hex))
    }
  }

  if (omp.palettes) {
    for (const [name, entry] of Object.entries(omp.palettes)) {
      const idx = ANSI_COLOR_NAMES[name]
      if (idx !== undefined && entry.color) {
        palette[idx] = normalizeHex(entry.color)
      }
    }
  }

  return palette
}

function extractForeground(omp: OmpTheme): string | undefined {
  const tc = omp.terminal_colors
  if (tc?.foreground) return normalizeHex(tc.foreground)
  const p = omp.palette
  if (p && typeof p === "object" && p.foreground) return normalizeHex(p.foreground)
  return undefined
}

function extractBackground(omp: OmpTheme): string | undefined {
  const tc = omp.terminal_colors
  if (tc?.background) return normalizeHex(tc.background)
  const p = omp.palette
  if (p && typeof p === "object" && p.background) return normalizeHex(p.background)
  return undefined
}

export function parseOmpTheme(raw: string): TermlessTheme {
  const omp = parseOmpContent(raw)

  const palette = extractAnsiPalette(omp)
  const foreground = extractForeground(omp) ?? DEFAULT_THEME.foreground
  const background = extractBackground(omp) ?? DEFAULT_THEME.background
  const cursor = palette[15] ?? DEFAULT_THEME.cursor

  return {
    name: "omp",
    foreground,
    background,
    cursor,
    palette: { ...DEFAULT_THEME.palette, ...palette },
  }
}
