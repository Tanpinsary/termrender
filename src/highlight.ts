/**
 * highlight — fish shell token-level syntax coloring for echoed command lines.
 *
 * Colors follow fish's default.theme fallback chain:
 *   get_highlight_var_name(t) → fish_color_xxx env var → default value
 *
 * classify() mirrors fish's color_as_argument() / color_command() logic:
 *   - First token is always a command.
 *   - Shell operators get distinct roles (pipe → end, others → operator).
 *   - Parameters are option vs param based solely on a '-' prefix when
 *     options are still allowed (end-of-options marker "--" blocks them).
 *   - Redirection tokens (>, <, 2>, &>, >& …) get their own role.
 *
 * Character-level coloring (escape, quote) is deferred — the token types
 * exist for future use but classify() never emits them today.
 */
const C: Record<string, string> = {
  command:     "\x1b[0m",      // reset — fish_color_command       (default: normal)
  param:       "\x1b[36m",     // cyan  — fish_color_param
  option:      "\x1b[36m",     // cyan  — fish_color_option          (fallback: param)
  operator:    "\x1b[96m",     // brcyan — fish_color_operator
  end:         "\x1b[35m",     // magenta — fish_color_end           (pipe only)
  quote:       "\x1b[33m",     // yellow — fish_color_quote
  error:       "\x1b[91m",     // brred — fish_color_error
  escape:      "\x1b[96m",     // brcyan — fish_color_escape
  redirection: "\x1b[1;36m",   // bold cyan — fish_color_redirection
}

const R = "\x1b[0m"

type TokenType = keyof typeof C

/** Match redirection tokens: >, >>, <, <<, 2>, 1>&2, &>, >|, etc. */
const REDIR_RE = /^\d*[<>]|^>&|^&>/

/**
 * Classify a single token using fish's simplified rules.
 *
 * Fish's full implementation also re-parses the pipeline to identify
 * commands after | or ;.  We do not — only the first token is "command".
 *
 * @param optionsAllowed — true unless a preceding "--" has appeared.
 */
function classify(
  token: string,
  i: number,
  optionsAllowed: boolean,
): TokenType {
  if (i === 0) return "command"

  if (token === "|") return "end"
  if (token === "&&" || token === "||" || token === ";" || token === "&") {
    return "operator"
  }

  if (REDIR_RE.test(token)) return "redirection"

  if (optionsAllowed && token.startsWith("-")) return "option"

  return "param"
}

/**
 * Apply fish-style syntax highlighting to a tokenized command line.
 *
 * Returns an ANSI-decorated string suitable for direct terminal output.
 * The signature is consumed by exec.ts: `highlight(command)` where command
 * is a `string[]` of tokens (including shell operators like "|" or "&&").
 */
export function highlight(args: string[]): string {
  let optionsAllowed = true
  return args
    .map((token, i) => {
      const type = classify(token, i, optionsAllowed)
      if (token === "|" || token === ";") optionsAllowed = true
      else if (token === "--") optionsAllowed = false
      return C[type] + token + R
    })
    .join(" ")
}
