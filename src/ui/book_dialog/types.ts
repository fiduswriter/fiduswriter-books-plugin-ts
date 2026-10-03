/**
 * Host-injected types for the book dialog.
 *
 * The dialog is browser-only but backend-agnostic: everything that differs
 * between the Django backend, a Nextcloud install and a local `.fidusbook`
 * file is described by the interfaces in this module.
 *
 * `ChapterLoader` and `E2EEStrategy` are the seams the exporters already use
 * (see `../../types.js`); the remaining host-specific concerns -- persisting
 * the edited book, picking a cover image, uploading a DOCX/ODT template and
 * handing a finished export to the user -- are declared here, following the
 * same injection pattern.
 */

import type {Schema} from "prosemirror-model"
import type {
    Book,
    BookCoverImage,
    BookStyle,
    BookStyles,
    ChapterLoader,
    CSL,
    DocumentListEntry,
    E2EEStrategy,
    User
} from "../../types.js"

/** One tab of the book dialog. */
export interface BookDialogPart {
    title: string
    description: string
    template: (bookInfo: BookDialogInfo) => string
}

/**
 * The image database entries a book dialog renders cover previews from.
 *
 * The dialog adds the book's own cover image to the host's image database
 * before rendering, so this is a plain record rather than an image manager
 * instance.
 */
export interface BookDialogImageDB {
    db: Record<number, {image?: string; [key: string]: unknown}>
}

/** The bundle every book-dialog tab template receives. */
export interface BookDialogInfo {
    book: Book
    documentList: DocumentListEntry[]
    citationStyles: Array<{id: string; title?: string}>
    bookStyleList: BookStyle[]
    imageDB: BookDialogImageDB
}

/** A cover image the user picked through the host's image picker. */
export interface BookDialogCoverImage {
    /** Id of the picked image. */
    id: number
    /** The image database entry, so the dialog can render a preview. */
    data: BookCoverImage
}

/** Hands a finished export to the user. */
export type BookExportDeliverer = (
    blob: Blob,
    filename: string,
    options: {description?: string; mimeType?: string; extensions?: string[]}
) => unknown

/**
 * Host-specific operations the book dialog needs in order to persist what the
 * user edits.
 *
 * Everything except {@link BookDialogBackend.saveBook} is optional. A host
 * that does not implement `selectCoverImage`, `saveDocxTemplate` or
 * `saveOdtTemplate` simply does not get the corresponding buttons or tabs in
 * the dialog, which is what a local-file host without template support wants.
 */
export interface BookDialogBackend {
    /**
     * Persist the edited book record.
     *
     * @param book - The book as edited in the dialog. The dialog hands over
     *   its working copy, so hosts must not rely on the object staying
     *   unmodified afterwards.
     * @returns A promise resolving to the stored book record. Its `id`,
     *   `added` and `updated` fields are copied back onto the dialog's book.
     */
    saveBook(book: Book): Promise<Book>

    /**
     * Open the host's image picker so the user can choose a book cover.
     *
     * @param currentCoverImageId - The currently selected cover image id, or
     *   `false` when the book has none, so the picker can preselect it.
     * @returns A promise resolving to the picked image, or to `null`/`false`
     *   when the user removed the cover image.
     */
    selectCoverImage?(
        currentCoverImageId: number | false
    ): Promise<BookDialogCoverImage | null | false>

    /**
     * Upload a DOCX template file and attach it to the book.
     *
     * @returns A promise resolving to the stored template's URL, or `null`
     *   when the upload was not stored.
     */
    saveDocxTemplate?(book: Book, file: File): Promise<string | null>

    /**
     * Upload an ODT template file and attach it to the book.
     *
     * @returns A promise resolving to the stored template's URL, or `null`
     *   when the upload was not stored.
     */
    saveOdtTemplate?(book: Book, file: File): Promise<string | null>
}

/**
 * What a host must supply to run a book sanity check.
 *
 * Both members are the same seams the book exporters already accept, so a
 * host that can export a book can run a sanity check without extra wiring.
 */
export interface BookDataContext {
    /** ProseMirror schema used to parse decrypted chapter content. */
    schema: Schema
    /** Loads chapters whose content is not in the document list yet. */
    chapterLoader: ChapterLoader
    /** Decrypts end-to-end encrypted chapters. */
    e2ee: E2EEStrategy
}

/**
 * What a host must additionally supply to run a book export.
 *
 * The dialog only offers its export menu when a context of this shape is
 * passed, so hosts that merely want a metadata editor can leave it out.
 */
export interface BookExportContext extends BookDataContext {
    /** Citation style engine used by the exporters. */
    csl: CSL
    /** Book styles used by the epub and print exporters. */
    bookStyles: BookStyles
    /** The logged-in user, stamped into the export. */
    user: User
    /** Hands the finished export to the user. */
    deliver: BookExportDeliverer
}

/** Constructor options of the book dialog. */
export interface BookDialogOptions extends BookDataContext {
    /**
     * The book to edit. Omit it to create a new book.
     *
     * The dialog works on a shallow copy of the record (with the metadata
     * block merged onto a complete one), leaving the host's own copy intact.
     * The `chapters` array is shared with the original, exactly as the Django
     * backend's dialog behaved.
     */
    book?: Book
    /** Documents the user may add as chapters. */
    documentList: DocumentListEntry[]
    /** Persists the dialog's changes and provides host-only pickers. */
    backend: BookDialogBackend
    /**
     * Export inputs. When omitted, the dialog renders without its export
     * dropdown.
     */
    exportContext?: BookExportContext
    /** Citation styles offered in the bibliography tab. */
    citationStyles?: Array<{id: string; title?: string}>
    /** Folder a newly created book is placed in. */
    path?: string
    /** The host's image database, used to render cover previews. */
    imageDB?: BookDialogImageDB
    /** Callbacks invoked after every successful save. */
    onSave?: Array<(book: Book) => Promise<unknown> | unknown>
}