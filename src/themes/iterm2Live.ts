/**
 * Live iTerm2 configuration reader.
 *
 * Instead of requiring an exported .itermcolors file, read the user's actual
 * effective profile straight from iTerm2's preferences plist
 * (~/Library/Preferences/com.googlecode.iterm2.plist): ANSI 16-color palette,
 * foreground/background/cursor, and the profile font.
 *
 * The plist is binary and contains <data> blobs, so a whole-file JSON convert
 * fails — instead each needed key is extracted individually with
 * `plutil -extract <keypath> json|raw` (macOS built-in).
 */

import type { TermlessTheme } from "./types"
import { DEFAULT_THEME } from "./types"

export interface Iterm2LiveConfig {
  theme: TermlessTheme
  profileName: string
  /** CSS-usable font family guess derived from the profile's PostScript font name. */
  fontFamily?: string
  /** Font point size from the profile. */
  fontSize?: number
}

const PLIST_PATH = `${process.env.HOME}/Library/Preferences/com.googlecode.iterm2.plist`

function plutil(keypath: string, format: "raw" | "json"): string | null {
  try {
    const proc = Bun.spawnSync(
      ["plutil", "-extract", keypath, format, "-o", "-", PLIST_PATH],
      { stderr: "ignore" },
    )
    if (proc.exitCode !== 0) return null
    const out = proc.stdout.toString().trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function componentToHex(c: number): string {
  const clamped = Math.max(0, Math.min(1, c))
  return Math.round(clamped * 255).toString(16).padStart(2, "0")
}

function srgbLinearize(v: number): number {
  if (v <= 0.04045) return v / 12.92
  return Math.pow((v + 0.055) / 1.055, 2.4)
}

function srgbEncode(v: number): number {
  if (v <= 0.0031308) return v * 12.92
  return 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055
}

/**
 * Convert Display P3 (D65) to sRGB — same gamma, different gamut.
 * Matrices from CSS Color Level 4, rounded to 6 significant digits
 * (higher precision is inaudible in 8-bit output).
 */
function p3ToSrgb(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbLinearize(r)
  const gl = srgbLinearize(g)
  const bl = srgbLinearize(b)

  const x = 0.486571 * rl + 0.265668 * gl + 0.198217 * bl
  const y = 0.228975 * rl + 0.691738 * gl + 0.079287 * bl
  const z = 0.0 * rl + 0.045113 * gl + 1.043944 * bl

  const rl2 = 3.24097 * x - 1.53738 * y - 0.498611 * z
  const gl2 = -0.969244 * x + 1.87597 * y + 0.041555 * z
  const bl2 = 0.055630 * x - 0.203977 * y + 1.05697 * z

  return [srgbEncode(rl2), srgbEncode(gl2), srgbEncode(bl2)]
}

function colorAt(profileIdx: number, key: string): string | null {
  const json = plutil(`New Bookmarks.${profileIdx}.${key}`, "json")
  if (!json) return null
  try {
    const d = JSON.parse(json) as Record<string, unknown>
    const r = d["Red Component"] as number | undefined
    const g = d["Green Component"] as number | undefined
    const b = d["Blue Component"] as number | undefined
    if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null

    const colorSpace = (d["Color Space"] as string | undefined) ?? "sRGB"
    if (colorSpace === "Display P3" || colorSpace === "Calibrated") {
      const [sr, sg, sb] = p3ToSrgb(r, g, b)
      return `#${componentToHex(sr)}${componentToHex(sg)}${componentToHex(sb)}`
    }

    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`
  } catch {
    return null
  }
}

/**
 * "MesloLGMDZForPowerline-Regular 12" → { family: "MesloLGMDZForPowerline", size: 12 }.
 * The family part is a PostScript name; we keep it verbatim and let the
 * rasterizer's system-font lookup do its best — the bundled monospace stack
 * remains as fallback.
 */
function parseProfileFont(raw: string): { family: string; size: number } | null {
  const m = /^(.+?)\s+([\d.]+)$/.exec(raw)
  if (!m) return null
  let family = m[1]!
  // Strip a trailing PostScript style suffix (-Regular, -Bold, …)
  family = family.replace(/-(Regular|Bold|Italic|Light|Medium|SemiBold|Thin|Heavy|Black)$/i, "")
  return { family, size: parseFloat(m[2]!) }
}

function findProfileIndex(profileName?: string): { idx: number; name: string } | null {
  const countRaw = plutil("New Bookmarks", "raw")
  const count = countRaw ? parseInt(countRaw, 10) : NaN
  if (isNaN(count) || count <= 0) return null

  const defaultGuid = plutil("Default Bookmark Guid", "raw")

  let fallback: { idx: number; name: string } | null = null
  for (let i = 0; i < count; i++) {
    const name = plutil(`New Bookmarks.${i}.Name`, "raw") ?? `#${i}`
    if (i === 0) fallback = { idx: 0, name }
    if (profileName) {
      if (name === profileName) return { idx: i, name }
    } else if (defaultGuid) {
      const guid = plutil(`New Bookmarks.${i}.Guid`, "raw")
      if (guid === defaultGuid) return { idx: i, name }
    }
  }
  return profileName ? null : fallback
}

/**
 * Read the user's live iTerm2 profile as a theme + font. Returns null when
 * not on macOS, iTerm2 has no preferences, or the named profile is missing.
 */
export function loadIterm2LiveConfig(profileName?: string): Iterm2LiveConfig | null {
  if (process.platform !== "darwin") return null

  const profile = findProfileIndex(profileName)
  if (!profile) return null

  const palette: Record<number, string> = { ...DEFAULT_THEME.palette }
  for (let i = 0; i <= 15; i++) {
    const hex = colorAt(profile.idx, `Ansi ${i} Color`)
    if (hex) palette[i] = hex
  }

  const foreground = colorAt(profile.idx, "Foreground Color") ?? DEFAULT_THEME.foreground
  const background = colorAt(profile.idx, "Background Color") ?? DEFAULT_THEME.background
  const cursor = colorAt(profile.idx, "Cursor Color") ?? DEFAULT_THEME.cursor

  const fontRaw = plutil(`New Bookmarks.${profile.idx}.Normal Font`, "raw")
  const font = fontRaw ? parseProfileFont(fontRaw) : null

  return {
    theme: {
      name: `iterm2:${profile.name}`,
      foreground,
      background,
      cursor,
      palette,
    },
    profileName: profile.name,
    fontFamily: font?.family,
    fontSize: font?.size,
  }
}
