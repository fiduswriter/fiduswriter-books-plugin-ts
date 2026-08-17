/**
 * Native `.fidusbook` importer.
 *
 * Uses `NativeImporter` from `@fiduswriter/document/importer/native` for each
 * chapter and delegates creation of the book record to a `BookImporterBackend`.
 */

import type {E2EEOptions, NativeImporterBackend} from "@fiduswriter/document"
import {NativeImporter} from "@fiduswriter/document/importer/native"
import {addAlert} from "fwtoolkit"

import type {BookImporterBackend, Chapter, User} from "../../types.js"

export {FIDUSBOOK_VERSION} from "./reader.js"
export {readFidusBookFile, FidusBookReader} from "./reader.js"
import {
    FIDUSBOOK_MIMETYPES,
    MIN_FIDUSBOOK_VERSION,
    MAX_FIDUSBOOK_VERSION
} from "./reader.js"

export interface E2EEOptionsResult {
    options: E2EEOptions
    password: string
}

export interface NativeBookImporterOptions {
    path?: string
    getE2EEOptions?: () => Promise<E2EEOptionsResult | null>
    onChapterImported?: (
        doc: Record<string, unknown>,
        password: string
    ) => Promise<void>
}

export class NativeBookImporter {
    file: Blob
    user: User
    path: string
    nativeBackend: NativeImporterBackend
    bookBackend: BookImporterBackend
    getE2EEOptions?: () => Promise<E2EEOptionsResult | null>
    onChapterImported?: (
        doc: Record<string, unknown>,
        password: string
    ) => Promise<void>

    ok: boolean
    statusText: string
    bookId: number | null

    constructor(
        file: Blob,
        user: User,
        nativeBackend: NativeImporterBackend,
        bookBackend: BookImporterBackend,
        options: string | NativeBookImporterOptions = "/"
    ) {
        const opts = typeof options === "string" ? {path: options} : options
        this.file = file
        this.user = user
        this.path = opts.path?.endsWith("/") ? opts.path : `${opts.path || "/"}/`
        this.nativeBackend = nativeBackend
        this.bookBackend = bookBackend
        this.getE2EEOptions = opts.getE2EEOptions
        this.onChapterImported = opts.onChapterImported

        this.ok = false
        this.statusText = ""
        this.bookId = null
    }

    /**
     * Entry point.  Validates the file is a ZIP, then delegates to the reader.
     */
    init(): Promise<NativeBookImporter> {
        return new Promise(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => {
                if (
                    reader.result &&
                    (reader.result as string).length > 60 &&
                    (reader.result as string).substring(0, 2) === "PK"
                ) {
                    this.readZip().then(() => resolve(this))
                } else {
                    this.statusText = gettext(
                        "The uploaded file does not appear to be a Fidusbook file."
                    )
                    resolve(this)
                }
            }
            reader.readAsText(this.file.slice(0, 64))
        })
    }

    async readZip(): Promise<void> {
        let textFiles: Array<{filename: string; content: string}> = []
        let binaryFiles: Array<{filename: string; content: Blob}> = []

        try {
            const JSZip = (await import("jszip")).default
            const zipfs = await JSZip.loadAsync(this.file)

            const filenames: string[] = []
            zipfs.forEach(filename => filenames.push(filename))

            await Promise.all(
                filenames
                    .filter(f => !f.endsWith("/"))
                    .map(async filename => {
                        const isText =
                            filename.endsWith(".json") ||
                            filename === "filetype-version" ||
                            filename === "mimetype"
                        const content = await zipfs.files[filename].async(
                            isText ? "string" : "blob"
                        )
                        if (isText) {
                            textFiles.push({
                                filename,
                                content: content as string
                            })
                        } else {
                            binaryFiles.push({
                                filename,
                                content: content as Blob
                            })
                        }
                    })
            )
        } catch (_error) {
            this.statusText = gettext(
                "The uploaded file does not appear to be a Fidusbook file."
            )
            return
        }

        return this.processFidusbookFile(textFiles, binaryFiles)
    }

    async processFidusbookFile(
        textFiles: Array<{filename: string; content: string}>,
        binaryFiles: Array<{filename: string; content: Blob}>
    ): Promise<void> {
        const versionEntry = textFiles.find(
            f => f.filename === "filetype-version"
        )
        const filetypeVersion = Number.parseFloat(versionEntry?.content || "")

        if (
            filetypeVersion < MIN_FIDUSBOOK_VERSION ||
            filetypeVersion > MAX_FIDUSBOOK_VERSION
        ) {
            this.statusText =
                gettext(
                    "The Fidusbook file version is not supported by this server: "
                ) + (versionEntry?.content || "")
            return
        }

        const mimetypeEntry = textFiles.find(f => f.filename === "mimetype")
        if (
            mimetypeEntry &&
            !FIDUSBOOK_MIMETYPES.includes(mimetypeEntry.content)
        ) {
            this.statusText = gettext(
                "The uploaded file does not appear to be a Fidusbook file."
            )
            return
        }

        const bookData = JSON.parse(
            textFiles.find(f => f.filename === "book.json")?.content || "{}"
        ) as Record<string, unknown>

        const sortedChapters = [...(bookData.chapters as Array<{chapter_index: number; number: number; part?: string}>)].sort(
            (a, b) => a.chapter_index - b.chapter_index
        )

        const importedDocIds: Record<number, number> = {}

        for (const chapter of sortedChapters) {
            const ci = chapter.chapter_index

            const docFile = textFiles.find(
                f => f.filename === `chapters/${ci}/document.json`
            )
            const imagesFile = textFiles.find(
                f => f.filename === `chapters/${ci}/images.json`
            )
            const bibFile = textFiles.find(
                f => f.filename === `chapters/${ci}/bibliography.json`
            )

            if (!docFile || !imagesFile || !bibFile) {
                addAlert(
                    "error",
                    gettext("Fidusbook file is missing data for chapter ") +
                        (sortedChapters.indexOf(chapter) + 1)
                )
                throw new Error(`Missing chapter data for index ${ci}`)
            }

            const docJson = JSON.parse(docFile.content) as Record<string, unknown>
            const imagesJson = JSON.parse(imagesFile.content) as Record<string, unknown>
            const bibJson = JSON.parse(bibFile.content) as Record<string, unknown>

            const chapterPrefix = `chapters/${ci}/images/`
            const chapterOtherFiles = binaryFiles
                .filter(f => f.filename.startsWith(chapterPrefix))
                .map(f => ({
                    filename: `images/${f.filename.slice(chapterPrefix.length)}`,
                    content: f.content
                }))

            const safeBookTitle = (bookData.title as string) || "Untitled"
            const chapterPath = `${this.path}${safeBookTitle}/${(docJson.title as string) || "Untitled"}`

            let e2eeResult: E2EEOptionsResult | null = null
            if (this.getE2EEOptions) {
                e2eeResult = await this.getE2EEOptions()
            }

            const importer = new NativeImporter(
                docJson,
                bibJson,
                {db: imagesJson as unknown as import("@fiduswriter/document").ImageDB["db"]},
                chapterOtherFiles,
                this.user,
                this.nativeBackend,
                {
                    requestedPath: chapterPath,
                    e2eeOptions: e2eeResult?.options ?? null
                }
            )

            let doc
            try {
                ;({doc} = await importer.init())
            } catch (error) {
                addAlert(
                    "error",
                    gettext("Could not import chapter ") +
                        ((docJson.title as string) ||
                            sortedChapters.indexOf(chapter) + 1)
                )
                throw error
            }

            importedDocIds[ci] = doc.id as number

            if (e2eeResult && this.onChapterImported) {
                await this.onChapterImported(doc, e2eeResult.password)
            }
        }

        const chapters: Chapter[] = sortedChapters.map(chapter => ({
            text: importedDocIds[chapter.chapter_index],
            number: chapter.number,
            part: chapter.part || ""
        }))

        const book = await this.bookBackend.createBook(bookData, chapters, false)
        this.bookId = book.id || null
        this.ok = true
        this.statusText = `"${bookData.title}" ${gettext("successfully imported.")}`
    }
}
