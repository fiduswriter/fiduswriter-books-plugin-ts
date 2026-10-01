/**
 * Local replacement for the unmaintained `pretty` package (v2.0.0), backed by
 * js-beautify 2. It replicates pretty's behavior exactly: HTML beautification
 * with fixed defaults, plus the "ocd" post-processing that condenses newlines
 * and spaces out comments.
 */

import jsBeautify from "js-beautify"

const beautify = jsBeautify as unknown as {
    html: (source: string, options?: object) => string
}

const DEFAULTS = {
    unformatted: ["code", "pre", "em", "strong", "span"],
    indent_inner_html: true,
    indent_char: " ",
    indent_size: 2,
    sep: "\n"
}

export interface PrettyOptions {
    ocd?: boolean
    newlines?: string
    indent_size?: number
    indent_char?: string
    indent_inner_html?: boolean
    unformatted?: string[]
    sep?: string
}

export default function pretty(str: string, options: PrettyOptions = {}): string {
    const opts: PrettyOptions & {sep: string} = {...DEFAULTS, ...options} as PrettyOptions & {sep: string}
    str = beautify.html(str, opts)

    if (opts.ocd === true) {
        if (opts.newlines) {
            opts.sep = opts.newlines
        }
        return ocd(str, opts)
    }

    return str
}

function ocd(str: string, options: PrettyOptions & {sep?: string}): string {
    return condenseNewlines(str, options)
        // Remove empty whitespace from the top of the file.
        .replace(/^\s+/g, "")
        // Remove extra whitespace from eof.
        .replace(/\s+$/g, "\n")
        // Add a space above each comment.
        .replace(/(\s*<!--)/g, "\n$1")
        // Bring closing comments up to the same line as closing tag.
        .replace(/>(\s*)(?=<!--\s*\/)/g, "> ")
}

// Inline replacement for the condense-newlines package (v0.2.1) as pretty used
// it: collapse runs of 2+ newlines into options.sep, with all-whitespace lines
// emptied first. \u2424 is the historic "symbol for newline" that the package
// also treated as a line break.
function condenseNewlines(str: string, options: {sep?: string}): string {
    const sep = options.sep || "\n\n"
    str = str
        .split("\n")
        .map(line => (isWhitespace(line) ? line.trim() : line))
        .join("\n")
    str = str.replace(/\s+$/, "\n")
    return str.replace(/(\r\n|\n|\u2424){2,}/g, sep)
}

function isWhitespace(str: string): boolean {
    // Regex copied from is-whitespace@0.3.0 for exact parity.
    return /^[\s\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF"]+$/.test(str)
}
