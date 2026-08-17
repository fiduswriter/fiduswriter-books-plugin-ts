import {describe, expect, it} from "@jest/globals"
import JSZip from "jszip"

import {FW_DOCUMENT_VERSION} from "@fiduswriter/document/schema"
import {NativeBookExporter} from "../../src/exporter/native/index.js"
import {FidusBookReader} from "../../src/importer/native/reader.js"
import {makeBook, makeDocumentList, schema, user} from "./support.js"

describe("Native book exporter / reader round-trip", () => {
    it("exports a .fidusbook that reads back with the same book and chapters", async () => {
        const book = makeBook()
        const documentList = makeDocumentList()

        const exporter = new NativeBookExporter(
            schema,
            book,
            user,
            documentList,
            new Date()
        )
        const blob = await exporter.init()

        // The base download() implementation returns the produced Blob.
        expect(blob).toBeInstanceOf(Blob)

        const buffer = await blob.arrayBuffer()
        const zip = await JSZip.loadAsync(buffer)

        // The archive marks itself as a Fidusbook.
        expect(zip.files["book.json"]).toBeDefined()
        expect(zip.files["filetype-version"]).toBeDefined()
        expect(zip.files["mimetype"]).toBeDefined()
        expect(await zip.file("mimetype")?.async("string")).toBe(
            "application/vnd.fiduswriter.book+zip"
        )
        expect(await zip.file("filetype-version")?.async("string")).toBe(
            FW_DOCUMENT_VERSION
        )

        const bookJson = JSON.parse(
            (await zip.file("book.json")?.async("string")) as string
        )
        expect(bookJson.title).toBe("Sample Book")
        expect(bookJson.chapters).toHaveLength(2)

        // Each chapter's document.json should be present.
        expect(zip.files["chapters/0/document.json"]).toBeDefined()
        expect(zip.files["chapters/1/document.json"]).toBeDefined()

        const chapter0 = JSON.parse(
            (await zip.file("chapters/0/document.json")?.async("string")) as string
        )
        expect(chapter0.title).toBe("Chapter One")
        expect(chapter0.content.type).toBe("doc")
        expect(chapter0.content.content[0].type).toBe("title")
        expect(chapter0.content.content[0].content[0].text).toBe("Chapter One")

        // Now read the archive back with the pure reader. JSZip in Node reads
        // from an ArrayBuffer/Buffer rather than a Blob, which is also how the
        // CLI consumes `.fidusbook` files.
        const reader = new FidusBookReader()
        const {book: readBook, documentList: readList} = await reader.read(buffer)

        expect(readBook.title).toBe("Sample Book")
        expect((readBook.chapters as unknown[])).toHaveLength(2)
        expect(readList).toHaveLength(2)

        const titles = readList.map(doc => doc.title).sort()
        expect(titles).toEqual(["Chapter One", "Chapter Two"])

        const firstChapter = readList.find(doc => doc.title === "Chapter One")!
        const firstContent = firstChapter.content as {
            type: string
            content: Array<{type: string; content?: Array<{text?: string}>}>
        }
        expect(firstContent.type).toBe("doc")
        expect(firstContent.content[0].type).toBe("title")
        expect(firstContent.content[0].content?.[0]?.text).toBe("Chapter One")
    })
})
