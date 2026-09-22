/**
 * Print book exporter.
 *
 * Renders the book in the browser using the selected pagination engine (see
 * `@fiduswriter/document/exporter/print`).
 */

import type {Schema} from "prosemirror-model"
import type {CSL, User} from "@fiduswriter/document"
import {getPrintEngine} from "@fiduswriter/document/exporter/print/index"

import type {Book, BookStyles, DocumentListEntry} from "../../types.js"
import {HTMLBookExporter} from "../html/index.js"
import {chapterTemplate} from "./templates.js"

export class PrintBookExporter extends HTMLBookExporter {
    constructor(
        schema: Schema,
        csl: CSL,
        documentStyles: BookStyles,
        book: Book,
        user: User,
        docList: DocumentListEntry[]
    ) {
        super(schema, csl, documentStyles, book, user, docList, 0, false, {
            relativeUrls: false
        })
        this.chapterTemplate = chapterTemplate
    }

    addBookStyle(): boolean {
        const bookStyle = this.bookStyles.find(
            style => style.slug === this.book.settings.book_style
        )
        if (!bookStyle) {
            return false
        }
        let contents = bookStyle.contents
        bookStyle.bookstylefile_set.forEach(
            ([url, filename]: [string, string]) =>
                (contents = contents.replace(
                    new RegExp(filename, "g"),
                    url
                ))
        )

        this.styleSheets.push({contents})
        return true
    }

    async createZip(): Promise<void> {
        const htmlDoc = this.textFiles.find(
            file => file.filename === "index.html"
        )?.contents
        if (!htmlDoc) {
            return
        }
        const engine = getPrintEngine()
        ;(window as unknown as {printInstance?: unknown}).printInstance = {
            engine: engine.name
        }
        await engine.print({html: htmlDoc, title: this.book.title})
    }

    async loadStyle(sheet: {
        url?: string
        filename?: string
        contents?: string
    }): Promise<{url?: string; filename?: string; contents?: string}> {
        if (sheet.url) {
            sheet.filename = sheet.url
            delete sheet.url
        }
        return sheet
    }
}
