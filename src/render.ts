import {
  createTerminal,
  parseAsciicast,
  replayAsciicast,
  screenshotPng,
  screenshotSvg,
} from "@termless/core"
import type {
  PngScreenshotOptions,
  SvgScreenshotOptions,
  SvgTheme,
} from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { TermlessTheme } from "./themes"
import { DEFAULT_THEME } from "./themes"

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

function splatTheme(t: TermlessTheme): SvgTheme {
  return {
    foreground: t.foreground,
    background: t.background,
    cursor: t.cursor,
    palette: { ...t.palette, ...t.brightPalette },
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

export function buildSvgOptions(theme: TermlessTheme, opts: RenderOptions): SvgScreenshotOptions {
  // Cell geometry must track font size or glyphs drift off the cell grid —
  // the library defaults (9.6 × 20) are tuned for a 16px font, so scale the
  // same ratios (0.6 / 1.25) for any other size.
  const fontSize = opts.fontSize
  const cellWidth = opts.cellWidth ?? (fontSize ? fontSize * 0.6 : undefined)
  const cellHeight = opts.cellHeight ?? (fontSize ? fontSize * 1.25 : undefined)
  return {
    theme: splatTheme(theme),
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    padding: opts.padding,
    borderRadius: opts.borderRadius,
    windowBar: opts.windowBar,
    margin: opts.margin,
    marginFill: opts.marginFill,
    cellWidth,
    cellHeight,
  }
}

export function buildPngOptions(theme: TermlessTheme, opts: RenderOptions): PngScreenshotOptions {
  return {
    ...buildSvgOptions(theme, opts),
    scale: 2,
  }
}

export async function renderCast(
  castPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<Uint8Array | string> {
  const header = await readCastHeader(castPath)
  const cols = options.cols ?? header.width
  const rows = options.rows ?? header.height

  const term = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows,
  })

  const content = await Bun.file(castPath).text()
  const recording = parseAsciicast(content)
  await replayAsciicast(recording, term, { speed: Infinity })

  const theme = options.theme ?? DEFAULT_THEME
  const isPng = outputPath.endsWith(".png")

  if (isPng) {
    const png = await screenshotPng(term, buildPngOptions(theme, options))
    await Bun.write(outputPath, png)
    await term.close()
    return png
  }

  const svg = screenshotSvg(term, buildSvgOptions(theme, options))
  await Bun.write(outputPath, svg)
  await term.close()
  return svg
}

export async function renderStdin(
  input: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<Uint8Array | string> {
  const cols = options.cols ?? 80
  const rows = options.rows ?? 24

  const term = createTerminal({
    backend: createXtermBackend(),
    cols,
    rows,
  })

  term.feed(input.replace(/\n/g, "\r\n"))

  const theme = options.theme ?? DEFAULT_THEME
  const isPng = outputPath.endsWith(".png")

  if (isPng) {
    const png = await screenshotPng(term, buildPngOptions(theme, options))
    await Bun.write(outputPath, png)
    await term.close()
    return png
  }

  const svg = screenshotSvg(term, buildSvgOptions(theme, options))
  await Bun.write(outputPath, svg)
  await term.close()
  return svg
}
