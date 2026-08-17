export * from "@fiduswriter/document/schema"
import {FW_DOCUMENT_VERSION} from "@fiduswriter/document/schema"

/** The Fidus Writer book archive version tracks the document version.
 * Book archives use the same version number as documents; there is no
 * independent book version.
 */
export const FIDUSBOOK_VERSION = FW_DOCUMENT_VERSION
