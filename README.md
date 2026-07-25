<p align="center">
  <img src="https://codeberg.org/fiduswriter/fiduswriter-books-document-js/raw/branch/main/logo.svg" alt="@fiduswriter/books-document" width="100" height="100">
</p>

<h1 align="center">@fiduswriter/books-document</h1>

<p align="center">Book-level importers and exporters for Fidus Writer</p>

---

## What it does

Implements book-level (composite/multi-document) importers and exporters for
Fidus Writer. Builds on top of `@fiduswriter/document` — reuses its
single-document export filters and composes them into book-level outputs.

### Supported export formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Native Fidus Book | `.fidusbook` | Full book archive with all chapters and assets |
| DOCX | `.docx` | Microsoft Word document |
| ODT | `.odt` | OpenDocument Text |
| LaTeX | `.tex` | LaTeX document |
| HTML | `.html` | Web page |
| EPUB | `.epub` | E-book |
| BITS | `.xml` | Book Interchange Tag Suite (JATS for books) |
| Print | `.pdf` | PDF via Vivliostyle |

## Exports

Main entry exports:

| Export | Description |
|--------|-------------|
| `FIDUSBOOK_VERSION` | Current Fidus Book format version number |

### Subpath exports

| Path | Description |
|------|-------------|
| `./schema` | Book document schema |
| `./importer/native` | Native `.fidusbook` format importer |
| `./exporter/native` | Native `.fidusbook` format exporter |
| `./exporter/docx` | Book to DOCX exporter |
| `./exporter/odt` | Book to ODT exporter |
| `./exporter/latex` | Book to LaTeX exporter |
| `./exporter/html` | Book to HTML exporter |
| `./exporter/epub` | Book to EPUB exporter |
| `./exporter/print` | Book to PDF exporter |
| `./exporter/bits` | Book to BITS exporter |
| `./exporter/tools` | Shared exporter utilities |
| `./i18n` | Internationalization strings |
| `./types` | TypeScript type definitions |

## Installation

```bash
npm install @fiduswriter/books-document
```

## Usage

```ts
import {FIDUSBOOK_VERSION} from "@fiduswriter/books-document"
import {NativeBookExporter} from "@fiduswriter/books-document/exporter/native"
import {DocxBookExporter} from "@fiduswriter/books-document/exporter/docx"
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Check types without emitting
npm test             # Run test suite (Jest)
npm run lint         # Lint with ESLint
npm run format:check # Check formatting with Prettier
```

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
