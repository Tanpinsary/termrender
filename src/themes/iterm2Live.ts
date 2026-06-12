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

function colorAt(profileIdx: number, key: string): string | null {
  const json = plutil(`New Bookmarks.${profileIdx}.${key}`, "json")
  if (!json) return null
  try {
    const d = JSON.parse(json) as Record<string, number>
    const r = d["Red Component"]
    const g = d["Green Component"]
    const b = d["Blue Component"]
    if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null
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
