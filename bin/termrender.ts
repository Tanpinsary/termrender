#!/usr/bin/env bun
import { Command } from "commander"
import { loadTheme, getSystemTheme } from "../src/themes/index"
import { renderCast, renderStdin } from "../src/render"
import type { RenderOptions } from "../src/render"
import { execAndRender } from "../src/exec"
import { DEFAULT_THEME } from "../src/themes/types"
import { loadIterm2LiveConfig } from "../src/themes/iterm2Live"
import type { TermlessTheme } from "../src/themes/index"
import type { ThemeFormat } from "../src/themes/index"
import type { PromptMode } from "../src/prompt"

const program = new Command()

program
  .name("termrender")
  .description("Render terminal screenshots that replicate your real terminal — prompt, colors, and all")
  .version("0.2.0")

interface ResolvedTheme {
  theme: TermlessTheme
  fontFamily?: string
  fontSize?: number
}

/**
 * Resolve --theme:
 *  - "auto"   → live iTerm2 profile (colors + font) from preferences
 *  - a path   → .itermcolors file (colors only)
 *  - omitted  → system theme (dark/light follows macOS appearance)
 */
async function resolveTheme(opts: Record<string, string>): Promise<ResolvedTheme> {
  if (opts.theme === "auto") {
    const live = loadIterm2LiveConfig(opts.profile)
    if (!live) {
      console.error(
        "Warning: --theme auto found no live iTerm2 preferences, using default theme",
      )
      return { theme: DEFAULT_THEME }
    }
    console.error(`Using iTerm2 profile "${live.profileName}" (colors + font)`)
    return { theme: live.theme, fontFamily: live.fontFamily, fontSize: live.fontSize }
  }

  if (opts.theme) {
    const file = Bun.file(opts.theme)
    if (!(await file.exists())) {
      console.error(`Theme file not found: ${opts.theme}`)
      process.exit(1)
    }
    const raw = await file.text()
    return { theme: await loadTheme(raw, opts.theme, (opts.themeType as ThemeFormat) ?? "auto") }
  }

  if (!opts.theme) {
    return { theme: getSystemTheme() }
  }

  return { theme: DEFAULT_THEME }
}

function buildRenderOpts(
  opts: Record<string, string>,
  resolved: ResolvedTheme,
): RenderOptions {
  return {
    cols: opts.cols ? parseInt(opts.cols, 10) : undefined,
    rows: opts.rows ? parseInt(opts.rows, 10) : undefined,
    theme: resolved.theme,
    // Explicit flags win; otherwise the live profile's font flows through.
    fontFamily: opts.fontFamily ?? resolved.fontFamily,
    fontSize: opts.fontSize ? parseInt(opts.fontSize, 10) : resolved.fontSize,
    padding: opts.padding ? parseInt(opts.padding, 10) : undefined,
    borderRadius: opts.borderRadius ? parseInt(opts.borderRadius, 10) : 8,
    windowBar: opts.windowBar as "none" | "rings" | "colorful" | undefined,
    margin: opts.margin ? parseInt(opts.margin, 10) : undefined,
    marginFill: opts.marginFill,
  }
}

/** Options shared by `render` and `exec`. */
function withCommonOptions(cmd: Command): Command {
  return cmd
    .option("-o, --output <path>", "Output file path (.png)", "output.png")
    .option("--theme <path|auto>", "Theme file (iTerm2 colors), or 'auto' for your live iTerm2 profile")
    .option("--theme-type <type>", "Force theme format: iterm2")
    .option("--profile <name>", "iTerm2 profile name for --theme auto (default: the default profile)")
    .option("--cols <n>", "Terminal columns (default: cast header width, or 80)")
    .option("--rows <n>", "Terminal rows (default: cast header height, or 24)")
    .option("--font-family <family>", "CSS font family for rendering")
    .option("--font-size <n>", "Font size in px")
    .option("--padding <n>", "Padding around terminal content", "12")
    .option("--border-radius <n>", "Border radius for terminal frame (default: 8)", "8")
    .option("--window-bar <style>", "Window bar style: none, rings, colorful")
    .option("--margin <n>", "Outer image margin", "0")
    .option("--margin-fill <color>", "Margin fill color (hex)")
}

withCommonOptions(
  program
    .command("render", { isDefault: true })
    .description("Render a screenshot from a .cast file or piped ANSI text")
    .argument("[input]", "Input .cast file (omit to read from stdin)"),
).action(async (input: string | undefined, opts: Record<string, string>) => {
  try {
    const resolved = await resolveTheme(opts)
    const renderOpts = buildRenderOpts(opts, resolved)

    if (input) {
      await renderCast(input, opts.output!, renderOpts)
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of Bun.stdin.stream()) {
        chunks.push(Buffer.from(chunk))
      }
      const stdinData = Buffer.concat(chunks).toString("utf-8")
      if (!stdinData.trim()) {
        console.error("No input provided. Pipe ANSI text or specify a .cast file.")
        process.exit(1)
      }
      await renderStdin(stdinData, opts.output!, renderOpts)
    }

    console.log(`Screenshot saved to ${opts.output}`)
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
})

withCommonOptions(
  program
    .command("exec")
    .description(
      "Run a command in a real PTY and screenshot it — real colors, your real prompt. " +
        "Example: termrender exec --theme auto -o ls.png -- eza -la",
    )
    .argument("<command...>", "Command to execute (prefix with -- to stop option parsing)"),
)
  .option("--prompt <mode>", "Prompt source: auto, fish, zsh, none", "auto")
  .option("--cwd <dir>", "Working directory for the command and prompt")
  .option("--timeout <ms>", "Max time to wait for the command to exit", "30000")
  .option("--no-auto-rows", "Keep full terminal height instead of trimming empty rows")
  .option("--no-trailing-prompt", "Don't repeat the prompt after the command exits")
  .action(async (command: string[], opts: Record<string, string>) => {
    try {
      const resolved = await resolveTheme(opts)
      const renderOpts = buildRenderOpts(opts, resolved)

      await execAndRender(command, opts.output!, {
        ...renderOpts,
        promptMode: opts.prompt as PromptMode,
        cwd: opts.cwd,
        timeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
        autoRows: (opts as Record<string, unknown>).autoRows as boolean | undefined,
        trailingPrompt: (opts as Record<string, unknown>).trailingPrompt as boolean | undefined,
      })

      console.log(`Screenshot saved to ${opts.output}`)
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  })

program
  .command("themes")
  .description("List theme sources")
  .action(() => {
    console.log("Theme sources:")
    console.log("  --theme auto          — your live iTerm2 profile (colors + font), macOS")
    console.log("  --theme <file>        — color schemes from:")
    console.log("      iTerm2 .itermcolors   exported color preset (full 16-color palette)")
    console.log("  (omitted)             — system theme (dark/light follows macOS appearance)")
  })

program.parse()
