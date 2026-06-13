import {
  createTerminal,
  parseAsciicast,
  replayAsciicast,
  screenshotPng,
} from "@termless/core"
import type {
  PngScreenshotOptions,
} from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { TermlessTheme } from "./themes"
import { getSystemTheme } from "./themes"

export interface RenderOptions {
  cols?: number
  rows?: number
  theme?: TermlessTheme
  fontFamily?: string
  fontSize?: number
  padding?: number
  borderRadius?: number
  windowBar?: "none" | "rings" | "colorful"
  margin?: number
  marginFill?: string
  cellWidth?: number
  cellHeight?: number
}

export function buildHexPalette(t: TermlessTheme): string[] {
  const out: string[] = []
  for (let i = 0; i < 16; i++) out.push(t.palette[i] ?? "#000000")
  return out
}

export function buildPngOptions(theme: TermlessTheme, opts: RenderOptions): PngScreenshotOptions {
  const fontSize = opts.fontSize
  const cellWidth = opts.cellWidth ?? (fontSize ? fontSize * 0.6 : undefined)
  const cellHeight = opts.cellHeight ?? (fontSize ? fontSize * 1.25 : undefined)
  return {
    theme: {
      foreground: theme.foreground,
      background: theme.background,
      cursor: theme.cursor,
      palette: { ...theme.palette, ...theme.brightPalette },
    },
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    padding: opts.padding,
    borderRadius: opts.borderRadius,
    windowBar: opts.windowBar,
    margin: opts.margin,
    marginFill: opts.marginFill,
    cellWidth,
    cellHeight,
    scale: 2,
  }
}

async function readCastHeader(castPath: string): Promise<{ width: number; height: number }> {
  const file = Bun.file(castPath)
  const content = await file.text()
  const lines = content.trim().split("\n")
  for (const line of lines) {
    try {
      const obj = JSON.parse(line)
      if (obj.version !== undefined) {
        return { width: obj.width ?? 80, height: obj.height ?? 24 }
      }
    } catch {
      continue
    }
  }
  return { width: 80, height: 24 }
}

export async function renderCast(
  castPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const header = await readCastHeader(castPath)
  const cols = options.cols ?? header.width
  const rows = options.rows ?? header.height

  const term = createTerminal({
    backend: createXtermBackend({ palette: buildHexPalette(options.theme ?? getSystemTheme()) }),
    cols,
    rows,
  })

  const content = await Bun.file(castPath).text()
  const recording = parseAsciicast(content)
  await replayAsciicast(recording, term, { speed: Infinity })

  const theme = options.theme ?? getSystemTheme()
  const png = await screenshotPng(term, buildPngOptions(theme, options))
  await Bun.write(outputPath, png)
  await term.close()
  return png
}

export async function renderStdin(
  input: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const cols = options.cols ?? 80
  const rows = options.rows ?? 24

  const term = createTerminal({
    backend: createXtermBackend({ palette: buildHexPalette(options.theme ?? getSystemTheme()) }),
    cols,
    rows,
  })

  term.feed(input.replace(/\n/g, "\r\n"))

  const theme = options.theme ?? getSystemTheme()
  const png = await screenshotPng(term, buildPngOptions(theme, options))
  await Bun.write(outputPath, png)
  await term.close()
  return png
}
