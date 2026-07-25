#!/usr/bin/env node

/**
 * compile-i18n.js
 *
 * Compiles .po translation files to .json catalog files.
 *
 * Each package ships .po files in locale/<lang>/LC_MESSAGES/messages.po.
 * This script reads them and writes locale/<lang>/messages.json.
 *
 * The JSON format is a flat msgid → msgstr map, with a special ""
 * entry containing metadata (language, plural-forms).
 *
 * Usage:
 *   node scripts/compile-i18n.js              # compile all languages
 *   node scripts/compile-i18n.js de fr        # compile specific languages
 *
 * Requires: gettext-parser (npm install --save-dev gettext-parser)
 */

import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    readdirSync,
    existsSync
} from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const localeDir = join(root, "locale")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let parsePo
try {
    const gettextParser = await import("gettext-parser")
    parsePo =
        gettextParser.po?.parse ||
        gettextParser.default?.po?.parse ||
        gettextParser.parse
} catch {
    console.error(
        "gettext-parser not found. Install it with:\n  npm install --save-dev gettext-parser"
    )
    process.exit(1)
}

function ensureDir(dir) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const langs = process.argv.slice(2)
const allLangs =
    langs.length > 0
        ? langs
        : readdirSync(localeDir, { withFileTypes: true })
              .filter(e => e.isDirectory())
              .map(e => e.name)

let total = 0

for (const lang of allLangs) {
    const poFile = join(localeDir, lang, "LC_MESSAGES", "messages.po")
    if (!existsSync(poFile)) {
        console.log(`  ${lang}: no messages.po found, skipping`)
        continue
    }

    const poContent = readFileSync(poFile, "utf8")
    const parsed = parsePo(poContent)

    /** @type {Record<string, string>} */
    const catalog = {}

    // Extract metadata
    const headers = parsed.headers || {}
    catalog[""] = [headers["language"] || lang, headers["plural-forms"] || ""]
        .filter(Boolean)
        .join("; ")

    // Extract translations
    const translations = parsed.translations || {}
    for (const [, entries] of Object.entries(translations)) {
        for (const [msgid, entry] of Object.entries(entries)) {
            if (!msgid) continue // skip header entry
            const msgstr = entry.msgstr
            if (Array.isArray(msgstr)) {
                catalog[msgid] = msgstr.join("\x00")
            } else if (msgstr) {
                catalog[msgid] = msgstr
            }
            // Plural forms
            if (entry.msgid_plural) {
                const key = `${msgid}\x00${entry.msgid_plural}`
                catalog[key] = Array.isArray(msgstr)
                    ? msgstr.join("\x00")
                    : msgstr || ""
            }
        }
    }

    // Write JSON
    const jsonFile = join(localeDir, lang, "messages.json")
    ensureDir(dirname(jsonFile))
    writeFileSync(jsonFile, JSON.stringify(catalog, null, 2) + "\n")

    const count = Object.keys(catalog).length - (catalog[""] ? 1 : 0)
    console.log(`  ${lang}: ${count} strings → ${jsonFile}`)
    total += count
}

console.log(`\nCompiled ${allLangs.length} languages, ${total} total strings.`)
