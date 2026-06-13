/**
 * exec — run a command in a real PTY and screenshot the result.
 *
 * This is the difference between "render some text" and "replicate the
 * user's terminal": programs detect the PTY and emit their real colored
 * output (ls, git, eza… all disable color when piped), and the user's real
 * prompt is rendered by their own prompt engine and injected above the
 * command, exactly like an interactive session.
 *
 * Flow:
 *  1. feed(prompt + typed command) — the echoed command line
 *  2. term.spawn(command) — real output, captured via onAfterWrite
 *  3. after exit, feed the prompt again (the "next prompt" a real terminal shows)
 *  4. auto-rows: re-feed the captured bytes into a terminal sized to the
 *     content, so the image has no dead space at the bottom
 */

import { createTerminal, screenshotPng } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import type { RenderOptions } from "./render"
import { buildHexPalette, buildPngOptions } from "./render"
import { getSystemTheme } from "./themes"
import { getPromptAnsi, type PromptMode } from "./prompt"
import { highlight } from "./highlight"

export interface ExecOptions extends RenderOptions {
  /** Prompt source. Default "auto" ($SHELL → any). "none" disables. */
  promptMode?: PromptMode
  /** Working directory for the command (and the prompt's path segment). */
  cwd?: string
  /** Max milliseconds to wait for the command to exit. Default 30000. */
  timeout?: number
  /** Trim trailing empty rows from the image. Default true. */
  autoRows?: boolean
  /** Repeat the prompt after the command exits. Default true when a prompt is shown. */
  trailingPrompt?: boolean
}

/** Rows used for the capture pass when the caller did not pin --rows. */
const CAPTURE_ROWS = 200
const DEFAULT_TIMEOUT_MS = 30_000

function toCrlf(s: string): string {
  return s.replace(/\r?\n/g, "\r\n")
}

async function waitForExit(
  term: { readonly exitInfo: string | null },
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (term.exitInfo !== null) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

function countUsedRows(lines: Array<Array<{ char: string }>>): number {
  for (let row = lines.length - 1; row >= 0; row--) {
    const hasContent = lines[row]!.some((c) => c.char !== "" && c.char !== " ")
    if (hasContent) return row + 1
  }
  return 1
}

export async function execAndRender(
  command: string[],
  outputPath: string,
  options: ExecOptions = {},
): Promise<Uint8Array> {
  const cols = options.cols ?? 80
  const autoRows = options.autoRows ?? true
  const rowsPinned = options.rows !== undefined
  const captureRows = rowsPinned ? options.rows! : autoRows ? CAPTURE_ROWS : 24
  const cwd = options.cwd ?? process.cwd()

  const prompt = getPromptAnsi({
    mode: options.promptMode,
    cwd,
  })

  // Capture every byte that reaches the screen (prompt feeds AND PTY output)
  // so the trim pass can replay the exact same content at the final size.
  const captured: Uint8Array[] = []
  const term = createTerminal({
    backend: createXtermBackend({ palette: buildHexPalette(options.theme ?? getSystemTheme()) }),
    cols,
    rows: captureRows,
    onAfterWrite: (data) => captured.push(data),
  })

  // 1. Prompt + echoed command line, with syntax highlighting on the command.
  const commandLine = highlight(command)
  if (prompt) {
    term.feed(toCrlf(prompt) + commandLine + "\r\n")
  }

  // 2. Real execution in a PTY.
  await term.spawn(command, { cwd })
  const exited = await waitForExit(term, options.timeout ?? DEFAULT_TIMEOUT_MS)
  if (!exited) {
    await term.close()
    throw new Error(
      `Command did not exit within ${options.timeout ?? DEFAULT_TIMEOUT_MS}ms — ` +
        `for long-running/interactive programs record a .cast and use \`render\` instead`,
    )
  }
  await term.waitForStable(80, 2000).catch(() => {})

  // 3. The next prompt, closing the frame like a real session.
  if (prompt && (options.trailingPrompt ?? true)) {
    term.feed(toCrlf(prompt))
  }

  // 4. Size the final image to the content.
  let renderTerm = term
  let createdTrimTerm = false
  if (!rowsPinned && autoRows) {
    const used = countUsedRows(term.getLines() as Array<Array<{ char: string }>>)
    const finalRows = Math.max(used, 3)
    if (finalRows < captureRows) {
      const trimTerm = createTerminal({
    backend: createXtermBackend({ palette: buildHexPalette(options.theme ?? getSystemTheme()) }),
        cols,
        rows: finalRows,
      })
      for (const chunk of captured) trimTerm.feed(chunk)
      renderTerm = trimTerm
      createdTrimTerm = true
    }
  }

  const theme = options.theme ?? getSystemTheme()

  try {
    const png = await screenshotPng(renderTerm, buildPngOptions(theme, options))
    await Bun.write(outputPath, png)
    return png
  } finally {
    if (createdTrimTerm) await renderTerm.close()
    await term.close()
  }
}
