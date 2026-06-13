#!/usr/bin/env bun
/**
 * termrender MCP server (stdio).
 *
 * Exposes termrender to agents as structured tools. The tool result carries
 * the rendered PNG as an image content block, so the calling agent SEES the
 * screenshot immediately — no follow-up file read, and it can self-correct
 * (wrong theme, clipped output, …) in the same loop.
 *
 * Register:
 *   Claude Code  claude mcp add --scope user --transport stdio termrender -- bun run /path/to/bin/termrender-mcp.ts
 *   Codex         codex mcp add termrender -- bun run /path/to/bin/termrender-mcp.ts
 *   OpenCode      opencode.json: { "mcp": { "termrender": { "type": "local", "command": ["bun", "run", "bin/termrender-mcp.ts"] } } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execAndRender } from "../src/exec"
import { renderStdin } from "../src/render"
import type { RenderOptions } from "../src/render"
import { loadTheme, DEFAULT_THEME } from "../src/themes/index"
import { loadIterm2LiveConfig } from "../src/themes/iterm2Live"
import type { PromptMode } from "../src/prompt"

const server = new McpServer({ name: "termrender", version: "0.2.0" })

// ── Shared option schema ──

const commonShape = {
  theme: z
    .string()
    .optional()
    .describe(
      'Theme: "auto" (the user\'s live iTerm2 profile — colors AND font; the default), ' +
        'a path to an .itermcolors/OMP/OMZ file, or "default" for the built-in dark theme',
    ),
  cols: z.number().int().min(20).max(400).optional().describe("Terminal columns (default 80)"),
  rows: z.number().int().min(3).max(300).optional().describe("Terminal rows (default: auto-fit content)"),
  fontSize: z.number().min(8).max(40).optional().describe("Font size px (default: profile font, or 16)"),
  windowBar: z
    .enum(["none", "rings", "colorful"])
    .optional()
    .describe('macOS window chrome (default "rings")'),
  outputPath: z
    .string()
    .optional()
    .describe("Where to save the PNG (default: a temp file; the image is returned either way)"),
}

interface CommonArgs {
  theme?: string
  cols?: number
  rows?: number
  fontSize?: number
  windowBar?: "none" | "rings" | "colorful"
  outputPath?: string
}

let outputCounter = 0
function defaultOutputPath(): string {
  outputCounter += 1
  return join(tmpdir(), `termrender-${process.pid}-${outputCounter}.png`)
}

async function resolveRenderOptions(args: CommonArgs): Promise<RenderOptions> {
  let theme = DEFAULT_THEME
  let fontFamily: string | undefined
  let fontSize = args.fontSize

  const requested = args.theme ?? "auto"
  if (requested === "auto") {
    const live = loadIterm2LiveConfig()
    if (live) {
      theme = live.theme
      fontFamily = live.fontFamily
      fontSize = fontSize ?? live.fontSize
    }
  } else if (requested !== "default") {
    const file = Bun.file(requested)
    if (!(await file.exists())) throw new Error(`Theme file not found: ${requested}`)
    theme = await loadTheme(await file.text(), requested)
  }

  return {
    theme,
    fontFamily,
    fontSize,
    cols: args.cols,
    rows: args.rows,
    windowBar: args.windowBar ?? "rings",
    padding: 12,
    borderRadius: 8,
  }
}

function imageResult(png: Uint8Array | string, outputPath: string) {
  const bytes = typeof png === "string" ? new TextEncoder().encode(png) : png
  return {
    content: [
      { type: "text" as const, text: `Saved to ${outputPath}` },
      {
        type: "image" as const,
        data: Buffer.from(bytes).toString("base64"),
        mimeType: "image/png" as const,
      },
    ],
  }
}

// ── Tools ──

server.registerTool(
  "render_command",
  {
    title: "Render a command as a terminal screenshot",
    description:
      "Run a command in a real PTY and screenshot it exactly as the user's terminal would show it: " +
      "their real shell prompt (user@host, path, git branch), live iTerm2 colors/font, and the " +
      "program's true colored output. Returns the PNG inline. " +
      "Commands must exit on their own (no servers/TUIs/watch modes).",
    inputSchema: {
      command: z
        .array(z.string())
        .min(1)
        .describe('Command as argv, e.g. ["git", "status", "-sb"]. No shell expansion — spawned directly.'),
      cwd: z.string().optional().describe("Working directory for the command and the prompt's path/git segments"),
      prompt: z
        .enum(["auto", "omp", "fish", "zsh", "none"])
        .optional()
        .describe('Prompt source (default "auto": detects the terminal\'s real shell)'),
      timeoutMs: z.number().int().min(500).max(120_000).optional().describe("Max wait for exit (default 30000)"),
      ...commonShape,
    },
  },
  async (args) => {
    const outputPath = args.outputPath ?? defaultOutputPath()
    const renderOpts = await resolveRenderOptions(args)
    const png = await execAndRender(args.command, outputPath, {
      ...renderOpts,
      promptMode: (args.prompt ?? "auto") as PromptMode,
      cwd: args.cwd,
      timeout: args.timeoutMs,
    })
    return imageResult(png, outputPath)
  },
)

server.registerTool(
  "render_text",
  {
    title: "Render ANSI text as a terminal screenshot",
    description:
      "Render pre-captured terminal output (may contain ANSI escape sequences) as a styled " +
      "terminal screenshot PNG, themed like the user's terminal. Use render_command instead " +
      "when you can re-run the command — it preserves colors that piped capture loses.",
    inputSchema: {
      text: z.string().min(1).describe("The terminal text to render; ANSI escapes are honored"),
      ...commonShape,
    },
  },
  async (args) => {
    const outputPath = args.outputPath ?? defaultOutputPath()
    const renderOpts = await resolveRenderOptions(args)
    // No PTY here, so auto-fit is an estimate: one row per input line (long
    // lines may wrap and need an explicit rows override).
    const lineCount = args.text.split("\n").length
    const png = await renderStdin(args.text, outputPath, {
      ...renderOpts,
      rows: args.rows ?? Math.min(Math.max(lineCount, 3), 300),
    })
    return imageResult(png, outputPath)
  },
)

await server.connect(new StdioServerTransport())
