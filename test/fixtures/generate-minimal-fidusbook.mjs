/**
 * Generates `test/fixtures/minimal.fidusbook`.
 *
 * A `.fidusbook` is a ZIP archive. This script builds a minimal but valid
 * two-chapter archive by hand (no server, no exporter) so the importer/reader
 * tests have a stable, checked-in fixture. Re-run with:
 *
 *   node test/fixtures/generate-minimal-fidusbook.mjs
 */
import {readFileSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import JSZip from "jszip"

const here = dirname(fileURLToPath(import.meta.url))

const sampleDoc = JSON.parse(
    readFileSync(join(here, "sample-doc.json"), "utf-8")
)

const chapterContent = title => {
    const content = JSON.parse(JSON.stringify(sampleDoc))
    content.content[0].content = [{type: "text", text: title}]
    return content
}

const chapterDocument = (id, title) => ({
    id,
    title,
    path: `/Minimal Book/${title}`,
    content: chapterContent(title),
    settings: {language: "en-US", citationstyle: "apa"},
    comments: {}
})

const book = {
    title: "Minimal Book",
    path: "/",
    metadata: {author: "Jane Doe"},
    settings: {language: "en-US", book_style: ""},
    chapters: [
        {number: 1, part: "Part One", chapter_index: 0},
        {number: 2, part: "", chapter_index: 1}
    ]
}

const zip = new JSZip()
zip.file("mimetype", "application/vnd.fiduswriter.book+zip", {compression: "STORE"})
// The book archive version tracks the Fidus Writer document version.
zip.file("filetype-version", "3.7")
zip.file("book.json", JSON.stringify(book))

const chapterTitles = ["Chapter One", "Chapter Two"]
chapterTitles.forEach((title, index) => {
    zip.file(
        `chapters/${index}/document.json`,
        JSON.stringify(chapterDocument(index + 1, title))
    )
    zip.file(`chapters/${index}/images.json`, JSON.stringify({}))
    zip.file(`chapters/${index}/bibliography.json`, JSON.stringify({}))
})

const buffer = await zip.generateAsync({type: "nodebuffer"})
writeFileSync(join(here, "minimal.fidusbook"), buffer)
console.log(`Wrote minimal.fidusbook (${buffer.length} bytes)`)
