#!/usr/bin/env node

/**
 * extract-i18n.js
 *
 * Scans src/ for gettext() calls, extracts unique msgids, looks up
 * translations from a Django djangojs.po file (including obsolete #~ entries),
 * and writes per-language messages.po into locale/.
 *
 * Usage:
 *   node scripts/extract-i18n.js <path-to-django-locale>
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
const djangoLocalePath = process.argv[2]

if (!djangoLocalePath) {
    console.error("Usage: node scripts/extract-i18n.js <django-locale-dir>")
    process.exit(1)
}

const GETTEXT_RE = /gettext\s*\(\s*["']([^"']+)["']\s*\)/g

const msgids = new Set()

function scanDir(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (
            entry.isDirectory() &&
            entry.name !== "node_modules" &&
            !entry.name.startsWith(".")
        ) {
            scanDir(full)
        } else if (
            entry.isFile() &&
            (entry.name.endsWith(".ts") ||
                entry.name.endsWith(".js") ||
                entry.name.endsWith(".mjs"))
        ) {
            const content = readFileSync(full, "utf8")
            let match
            while ((match = GETTEXT_RE.exec(content)) !== null) {
                msgids.add(match[1])
            }
        }
    }
}

console.log("Scanning src/ for gettext() calls...")
scanDir(join(root, "src"))
console.log(`Found ${msgids.size} unique msgids.\n`)

if (msgids.size === 0) {
    console.log("No gettext() calls found.")
    process.exit(0)
}

// Build translation maps from djangojs.po — including obsolete #~ entries
const languages = readdirSync(djangoLocalePath, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)

console.log(
    `Looking up translations in ${languages.length} languages (including obsolete entries)...`
)

let totalTranslated = 0

for (const lang of languages) {
    const poFile = join(djangoLocalePath, lang, "LC_MESSAGES", "djangojs.po")
    if (!existsSync(poFile)) continue

    const poContent = readFileSync(poFile, "utf8")
    const translationMap = new Map()

    // Parse active entries
    let currentMsgid = null
    let currentComment = ""
    for (const line of poContent.split("\n")) {
        const trimmed = line.trim()
        // Skip obsolete lines for active parsing
        if (trimmed.startsWith("#~")) continue

        if (trimmed.startsWith("#:")) {
            if (currentMsgid === null) currentComment += line + "\n"
            continue
        }
        if (
            trimmed.startsWith("#,") ||
            trimmed.startsWith("#.") ||
            trimmed.startsWith("#|")
        ) {
            if (currentMsgid === null) currentComment += line + "\n"
            continue
        }
        if (trimmed.startsWith("#") && !trimmed.startsWith("#:")) continue
        if (trimmed.startsWith('msgid "')) {
            currentMsgid = unescapePo(trimmed.slice(7, -1))
            continue
        }
        if (trimmed.startsWith("msgid ")) {
            currentMsgid = unescapePo(trimmed.slice(6))
            continue
        }
        if (trimmed.startsWith('msgstr "') && currentMsgid !== null) {
            const msgstr = unescapePo(trimmed.slice(8, -1))
            if (msgstr)
                translationMap.set(currentMsgid, {
                    msgstr,
                    comment: currentComment.trim()
                })
            currentMsgid = null
            currentComment = ""
            continue
        }
        if (trimmed.startsWith("msgstr ") && currentMsgid !== null) {
            const msgstr = unescapePo(trimmed.slice(7))
            if (msgstr)
                translationMap.set(currentMsgid, {
                    msgstr,
                    comment: currentComment.trim()
                })
            currentMsgid = null
            currentComment = ""
            continue
        }
        if (
            trimmed.startsWith("msgid_plural") ||
            trimmed.startsWith("msgstr[")
        ) {
            currentMsgid = null
            currentComment = ""
            continue
        }
        if (trimmed.startsWith('"') && currentMsgid !== null) {
            currentMsgid += unescapePo(trimmed.slice(1, -1))
        }
    }

    // Also parse obsolete entries (#~ msgid ... #~ msgstr ...)
    // State machine: null = awaiting entry, "msgid" = building msgid, "msgstr" = building msgstr
    let obsState = null // null | "msgid" | "msgstr"
    let obsMsgid = "" // accumulating msgid (may span multiple #~ "..." lines)
    let obsMsgstr = "" // accumulating msgstr
    let obsPrevMsgid = null

    function saveObsolete() {
        if (obsMsgid && obsMsgstr && !translationMap.has(obsMsgid)) {
            translationMap.set(obsMsgid, { msgstr: obsMsgstr, comment: "" })
        }
        if (obsPrevMsgid && obsMsgstr && !translationMap.has(obsPrevMsgid)) {
            translationMap.set(obsPrevMsgid, { msgstr: obsMsgstr, comment: "" })
        }
    }

    for (const line of poContent.split("\n")) {
        const trimmed = line.trim()

        // ----------- start of obsolete msgid -----------
        if (trimmed.startsWith('#~ msgid "')) {
            saveObsolete() // save any previous entry
            obsState = "msgid"
            obsMsgid = unescapePo(trimmed.slice(10, -1))
            obsMsgstr = ""
            obsPrevMsgid = null
            continue
        }
        // Also handle msgid without quotes (rare)
        if (
            trimmed.startsWith("#~ msgid ") &&
            !trimmed.startsWith('#~ msgid "')
        ) {
            saveObsolete()
            obsState = "msgid"
            obsMsgid = unescapePo(trimmed.slice(9))
            obsMsgstr = ""
            obsPrevMsgid = null
            continue
        }
        // ----------- previous msgid marker -----------
        if (trimmed.startsWith('#~| msgid "')) {
            obsPrevMsgid = unescapePo(trimmed.slice(12, -1))
            continue
        }
        // ----------- start of obsolete msgstr -----------
        if (trimmed.startsWith('#~ msgstr "') && obsState === "msgid") {
            obsState = "msgstr"
            obsMsgstr = unescapePo(trimmed.slice(11, -1))
            // If the msgid is non-empty and this is a single-line msgstr, save immediately
            continue
        }
        if (
            trimmed.startsWith("#~ msgstr ") &&
            obsState === "msgid" &&
            !trimmed.startsWith('#~ msgstr "')
        ) {
            obsState = "msgstr"
            obsMsgstr = unescapePo(trimmed.slice(10))
            continue
        }
        // ----------- multi-line continuation -----------
        if (trimmed.startsWith('#~ "') && obsState !== null) {
            const fragment = unescapePo(trimmed.slice(4, -1))
            if (obsState === "msgid") {
                obsMsgid += fragment
            } else if (obsState === "msgstr") {
                obsMsgstr += fragment
            }
            continue
        }
        // ----------- end of entry (next #~ msgid or non-obsolete line) -----------
        if (
            obsState === "msgstr" &&
            (trimmed.startsWith("#~ msgid") || !trimmed.startsWith("#~"))
        ) {
            saveObsolete()
            obsState = null
            obsMsgid = ""
            obsMsgstr = ""
        }
    }
    // Save any trailing entry
    if (obsState === "msgstr") {
        saveObsolete()
    }

    // Build entries — merge existing translations from the target .po file
    // if it already exists, so translations added by translate_all.py or
    // manual editing are preserved across re-extractions.
    const existingPo = join(root, "locale", lang, "LC_MESSAGES", "messages.po")
    const existingTranslations = new Map()
    if (existsSync(existingPo)) {
        const existingContent = readFileSync(existingPo, "utf8")
        let curMsgid = null
        for (const line of existingContent.split("\n")) {
            const trimmed = line.trim()
            if (trimmed.startsWith('msgid "')) {
                curMsgid = unescapePo(trimmed.slice(7, -1))
                continue
            }
            if (trimmed.startsWith('msgstr "') && curMsgid !== null) {
                const ms = unescapePo(trimmed.slice(8, -1))
                if (ms) existingTranslations.set(curMsgid, ms)
                curMsgid = null
                continue
            }
            if (trimmed.startsWith('"') && curMsgid !== null) {
                curMsgid += unescapePo(trimmed.slice(1, -1))
            }
        }
    }

    const entries = []
    for (const msgid of msgids) {
        // Prefer existing translation over djangojs.po lookup (no synthetic comment)
        const existing = existingTranslations.get(msgid)
        const t = existing
            ? { msgstr: existing, comment: "" }
            : translationMap.get(msgid)
        entries.push({
            msgid,
            msgstr: t ? t.msgstr : "",
            comment: t ? t.comment : ""
        })
        if (t?.msgstr) totalTranslated++
    }
    entries.sort((a, b) => a.msgid.localeCompare(b.msgid))

    const header = [
        `# Translations for this package`,
        `# Language: ${lang}`,
        "# Auto-generated by extract-i18n.js",
        "#",
        'msgid ""',
        'msgstr ""',
        '"Content-Type: text/plain; charset=UTF-8\\n"',
        `"Language: ${lang}\\n"`,
        '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
        ""
    ].join("\n")

    const body = entries
        .map(e => {
            let lines = ""
            if (e.comment && !e.comment.startsWith("# obsolete")) {
                lines += e.comment + "\n"
            }
            lines += `msgid "${escapePo(e.msgid)}"\n`
            lines += `msgstr "${escapePo(e.msgstr)}"\n`
            return lines + "\n"
        })
        .join("")

    const langDir = join(root, "locale", lang, "LC_MESSAGES")
    mkdirSync(langDir, { recursive: true })
    writeFileSync(join(langDir, "messages.po"), header + body, "utf8")

    const translated = entries.filter(e => e.msgstr).length
    console.log(
        `  ${lang}: ${entries.length} entries, ${translated} translated`
    )
}

console.log(`\nTotal translated strings: ${totalTranslated}`)

function escapePo(s) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
}
function unescapePo(s) {
    return s
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\t/g, "\t")
        .replace(/\\\\/g, "\\")
}
