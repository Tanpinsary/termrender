import type { TermlessTheme } from "./types"
import { DEFAULT_THEME } from "./types"
import { XMLParser } from "fast-xml-parser"

function componentToHex(c: number): string {
  const clamped = Math.max(0, Math.min(1, c))
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
}

type ColorComponents = { r: number; g: number; b: number }

function readColorComponents(node: unknown): ColorComponents | null {
  let items: unknown[]
  if (node && typeof node === "object" && "dict" in node) {
    items = (node as Record<string, unknown>).dict as unknown[]
  } else if (Array.isArray(node)) {
    items = node
  } else {
    return null
  }

  let r = 0, g = 0, b = 0
  let found = false

  for (let i = 0; i < items.length; i++) {
    const keyVal = readKeyText(items[i])
    if (!keyVal) continue
    const nextItem = items[i + 1]
    if (!nextItem || typeof nextItem !== "object") continue
    const val = readValue(nextItem)
    if (val === undefined) continue

    if (keyVal === "Red Component") { r = Number(val); found = true }
    else if (keyVal === "Green Component") { g = Number(val); found = true }
    else if (keyVal === "Blue Component") { b = Number(val); found = true }
  }
  return found ? { r, g, b } : null
}

function readKeyText(item: unknown): string | null {
  if (item && typeof item === "object" && "key" in item) {
    const keyArr = (item as Record<string, unknown>).key
    if (Array.isArray(keyArr) && keyArr.length > 0) {
      const first = keyArr[0]
      if (first && typeof first === "object" && "#text" in first) {
        return String((first as Record<string, string>)["#text"])
      }
    }
  }
  return null
}

function readValue(item: unknown): string | number | boolean | undefined {
  if (!item || typeof item !== "object") return undefined
  const obj = item as Record<string, unknown>
  for (const tag of ["string", "real", "integer", "true", "false"]) {
    if (tag in obj) {
      const arr = obj[tag]
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0]
        if (first && typeof first === "object" && "#text" in first) {
          const text = (first as Record<string, string>)["#text"]
          if (tag === "true") return true
          if (tag === "false") return false
          if (tag === "real" || tag === "integer") return Number(text)
          return text
        }
      }
    }
  }
  return undefined
}

export function parseIterm2Theme(xml: string): TermlessTheme {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
  })
  const parsed = parser.parse(xml)
  if (!Array.isArray(parsed)) return DEFAULT_THEME

  const topDict = findPlistDict(parsed)
  if (!topDict) return DEFAULT_THEME

  const palette: Record<number, string> = { ...DEFAULT_THEME.palette }
  let foreground: string | undefined
  let background: string | undefined
  let cursor: string | undefined

  for (let i = 0; i < topDict.length; i++) {
    const item = topDict[i]
    const keyVal = readKeyText(item)
    if (!keyVal) continue

    const nextItem = topDict[i + 1]
    if (!nextItem || typeof nextItem !== "object") continue

    const colors = readColorComponents(nextItem)
    if (colors) {
      const hex = `#${componentToHex(colors.r)}${componentToHex(colors.g)}${componentToHex(colors.b)}`

      if (keyVal === "Background Color") background = hex
      else if (keyVal === "Foreground Color") foreground = hex
      else if (keyVal === "Cursor Color") cursor = hex
      else {
        const match = keyVal.match(/^Ansi\s+(\d+)\s+Color$/i)
        if (match) {
          const idx = parseInt(match[1], 10)
          if (idx >= 0 && idx <= 15) palette[idx] = hex
        }
      }
    }
  }

  return {
    name: "iterm2",
    foreground: foreground ?? DEFAULT_THEME.foreground,
    background: background ?? DEFAULT_THEME.background,
    cursor: cursor ?? palette[7] ?? DEFAULT_THEME.cursor,
    palette,
  }
}

function findPlistDict(parsed: unknown[]): unknown[] | null {
  for (const item of parsed) {
    if (item && typeof item === "object" && "plist" in item) {
      const plistArr = (item as Record<string, unknown>).plist
      if (Array.isArray(plistArr) && plistArr.length > 0) {
        const plist = plistArr[0]
        if (plist && typeof plist === "object") {
          const dict = (plist as Record<string, unknown>).dict
          if (Array.isArray(dict)) return dict
        }
      }
    }
  }
  return null
}
