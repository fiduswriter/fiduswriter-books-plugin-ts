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

        // Container hardening: the first entry must be an uncompressed
        // "mimetype" entry so that content sniffers find the media type at the
        // fixed byte offset 38.
        const bytes = new Uint8Array(buffer)
        const bookMimetype = "application/vnd.fiduswriter.book+zip"
        expect(
            String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
        ).toBe("PK\x03\x04")
        expect(bytes[8] | (bytes[9] << 8)).toBe(0)
        expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe("mimetype")
        expect(
            new TextDecoder().decode(
                bytes.slice(38, 38 + bookMimetype.length)
            )
        ).toBe(bookMimetype)

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

describe("Native book exporter chapter identity", () => {
    // Regression test: the exporter used to drop both the chapter's `text`
    // (document id) from book.json and the document `id` from each
    // chapters/<n>/document.json. The reader then rebuilt every document-list
    // entry with `id: 0` while book.json referenced `text: 1`, so
    // `getMissingChapterData`'s lookup
    // (`documentList.find(doc => doc.id === chapter.text)`) found nothing and
    // re-exporting an already-written book failed with "you lack access rights
    // to its chapters". Pin both halves of that linkage here.
    it("persists the chapter document id so a written book can be re-exported", async () => {
        const book = makeBook()
        const documentList = makeDocumentList()

        const first = await new NativeBookExporter(
            schema,
            book,
            user,
            documentList,
            new Date()
        ).init()

        const buffer = await first.arrayBuffer()
        const zip = await JSZip.loadAsync(buffer)

        // book.json must carry each chapter's document id...
        const bookJson = JSON.parse(
            (await zip.file("book.json")?.async("string")) as string
        )
        const chapters = bookJson.chapters as Array<{text?: number}>
        expect(chapters).toHaveLength(2)
        for (const chapter of chapters) {
            expect(typeof chapter.text).toBe("number")
        }

        // ...and each chapter's document.json must carry the matching id, or
        // the reader cannot line the two up again.
        for (let index = 0; index < chapters.length; index++) {
            const docJson = JSON.parse(
                (await zip.file(`chapters/${index}/document.json`)?.async(
                    "string"
                )) as string
            )
            expect(typeof docJson.id).toBe("number")
        }

        // The decisive assertion: read the written book back and export it
        // again. Before the fix this threw "Cannot produce book as you lack
        // access rights to its chapters."
        const {book: readBook, documentList: readList} =
            await new FidusBookReader().read(buffer)
        expect(readList.map(doc => doc.id).sort()).toEqual([1, 2])

        const second = await new NativeBookExporter(
            schema,
            readBook,
            user,
            readList,
            new Date()
        ).init()
        expect(second.size).toBeGreaterThan(0)
    })

    it("keeps chapter titles and metadata across a round trip", async () => {
        const book = makeBook()
        const documentList = makeDocumentList()
        const blob = await new NativeBookExporter(
            schema,
            book,
            user,
            documentList,
            new Date()
        ).init()

        const {book: readBook, documentList: readList} =
            await new FidusBookReader().read(await blob.arrayBuffer())

        expect(readBook.title).toBe(book.title)
        expect(readBook.metadata).toEqual(book.metadata)
        expect(readList.map(doc => doc.title).sort()).toEqual([
            "Chapter One",
            "Chapter Two"
        ])
    })
})
