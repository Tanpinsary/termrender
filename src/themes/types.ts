export interface TermlessTheme {
  foreground: string
  background: string
  cursor: string
  palette: Record<number, string>
  name?: string
  brightPalette?: Record<number, string>
}

export const ANSI_COLOR_NAMES: Record<string, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  "bright-black": 8,
  "bright-red": 9,
  "bright-green": 10,
  "bright-yellow": 11,
  "bright-blue": 12,
  "bright-magenta": 13,
  "bright-cyan": 14,
  "bright-white": 15,
  lightBlack: 8,
  lightRed: 9,
  lightGreen: 10,
  lightYellow: 11,
  lightBlue: 12,
  lightMagenta: 13,
  lightCyan: 14,
  lightWhite: 15,
}

export const DEFAULT_THEME: TermlessTheme = {
  name: "default-dark",
  foreground: "#d4d4d4",
  background: "#1e1e1e",
  cursor: "#aeafad",
  palette: {
    0: "#000000",
    1: "#cd3131",
    2: "#0dbc79",
    3: "#e5e510",
    4: "#2472c8",
    5: "#bc3fbc",
    6: "#11a8cd",
    7: "#e5e5e5",
    8: "#666666",
    9: "#f14c4c",
    10: "#23d18b",
    11: "#f5f543",
    12: "#3b8eea",
    13: "#d670d6",
    14: "#29b8db",
    15: "#ffffff",
  },
}

export const DEFAULT_LIGHT_THEME: TermlessTheme = {
  name: "default-light",
  foreground: "#333333",
  background: "#ffffff",
  cursor: "#333333",
  palette: {
    0: "#333333",
    1: "#cd3131",
    2: "#0dbc79",
    3: "#e5e510",
    4: "#2472c8",
    5: "#bc3fbc",
    6: "#11a8cd",
    7: "#e5e5e5",
    8: "#666666",
    9: "#f14c4c",
    10: "#23d18b",
    11: "#f5f543",
    12: "#3b8eea",
    13: "#d670d6",
    14: "#29b8db",
    15: "#ffffff",
  },
}

export const ANSI_FALLBACK_PALETTE: Record<number, string> = {
  0: "#000000",
  1: "#800000",
  2: "#008000",
  3: "#808000",
  4: "#000080",
  5: "#800080",
  6: "#008080",
  7: "#c0c0c0",
  8: "#808080",
  9: "#ff0000",
  10: "#00ff00",
  11: "#ffff00",
  12: "#0000ff",
  13: "#ff00ff",
  14: "#00ffff",
  15: "#ffffff",
}

export function normalizeHex(color: string): string {
  const cleaned = color.replace(/^#/, "").toLowerCase()
  if (cleaned.length === 3) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`
  }
  if (cleaned.length === 6) {
    return `#${cleaned}`
  }
  const rgbMatch = cleaned.match(
    /^([0-9a-f]{2})[0-9a-f]*\/([0-9a-f]{2})[0-9a-f]*\/([0-9a-f]{2})[0-9a-f]*$/,
  )
  if (rgbMatch) {
    return `#${rgbMatch[1]}${rgbMatch[2]}${rgbMatch[3]}`
  }
  return `#${cleaned}`
}
