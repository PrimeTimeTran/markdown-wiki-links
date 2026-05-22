# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

A VSCode extension that enables Obsidian-style `[[wiki-links]]` between Markdown files in the workspace, with click-to-follow, hover preview, autocomplete, rename-aware link updates, diagnostics for broken links, and inline embeds via `![[...]]`.

Scope is **workspace-local Markdown/media only** — wiki-links must not resolve to anything outside the current workspace.

## Tech stack & commands

TypeScript, pnpm, esbuild bundling, `@vscode/test-cli` + `@vscode/test-electron` (Mocha) for tests.

- `pnpm build` — bundle the extension and the markdown-it plugin into `dist/` via esbuild
- `pnpm compile:tests` — `tsc` compiles `src/` + `test/` into `out/`
- `pnpm test:unit` — fast Mocha unit suite (`test/unit/`, no VSCode runtime)
- `pnpm test:e2e` — runs the e2e suites in a real Extension Development Host (`test/e2e/`)
- `pnpm test` — `pretest` (format check, lint, build, compile) then unit + e2e
- `pnpm lint` / `pnpm format` — ESLint / Prettier

E2e suites are split per fixture workspace in `.vscode-test.mjs` (labels: `unique`, `ambiguous`, `boundary`, `renames`, `fragments`, `embeds`); run one with `pnpm exec vscode-test --label <name>`.

## Architecture

Hexagonal layering, enforced by ESLint `no-restricted-imports`:

- `src/core/**` — pure logic, **no `vscode` imports**: parsers (`linkParser`, `embedParser`), `fenceMask`, `frontmatter`, extractors (`headingExtractor`, `blockIdExtractor`, `sectionSlice`), `resolver/resolveTarget`, `rename/rewriteWikiRefs`, `completion/rankCompletions`, `imageSize` (intrinsic dimensions from image headers), `pathFilter` (excluded-folder matching). Unit-tested in plain Node.
- `src/adapters/**` — VSCode glue: `indexService`, `workspaceBoundary`, the providers (`documentLinkProvider`, `hoverProvider`, `completionProvider`), `renameHandler`, `diagnostics`, `previewResolver`. May import `vscode` and `src/core/**`.
- `src/markdownItPlugin/**` — the wiki plugin contributed to the Markdown preview via `contributes["markdown.markdownItPlugins"]`. Rewrites `[[...]]` into navigable links and expands `![[...]]` embeds; reads the source document from `env.currentDocument`. **No `vscode` imports** (runs in the preview process).
- `src/extension.ts` — composition root: activates, builds `IndexService`, wires providers.

Tests: `test/unit/` (pure-core, fast) and `test/e2e/` (real Extension Development Host). E2e tests must not import `src/**` internals — they drive features through VSCode's public command surface (`vscode.executeLinkProvider`, `executeHoverProvider`, `executeCompletionItemProvider`, `applyEdit` with `RenameFile`).

## Wiki-link syntax (authoritative spec)

The README is the user-facing source of truth. Two forms — **link** (`[[...]]`) and **embed** (`![[...]]`):

```
[[ target [#fragment] [|display] ]]
target    := file-name (no extension required) | empty (same-file fragment)
fragment  := heading text | "^" block-id
display   := arbitrary text shown in place of the rendered link
```

Resolution rules that aren't obvious from the syntax alone:

- **Bare vs slashed targets resolve differently.** A bare `[[foo]]` uses unique base-name match; on ambiguity it prefers a single workspace-root-level match, else does a closest-parent ancestor walk (bounded to the workspace root). A slashed `[[a/b]]` uses unique global suffix match — **no walk**; ambiguous suffix → unresolved.
- **`..` segments and absolute paths are rejected** by the resolver.
- **Supported file extensions:** `.md` and `.markdown` for Markdown targets. Image media (png/jpg/jpeg/gif/webp/svg) resolves as both link and embed targets — a plain `[[image.png]]` link hover-previews the image, `![[image.png]]` embeds it.
- **YAML frontmatter is excluded.** Wiki-links inside a leading `---` block are not rewritten on rename, and frontmatter is stripped from embed/hover previews (`core/frontmatter.ts`).
- **Index excludes vendor/VCS folders.** `core/pathFilter.ts` keeps files in `.git`, `node_modules`, etc. out of the index; the folder list is configurable via `wikiLinks.index.excludeFolders`.
- **Block IDs** (`^block-id`) are defined by suffixing a paragraph (`text ^id`) or, for lists/quotes, placing `^id` on a line _after_ the block. Both forms are recognized.
- **Same-file fragment**: `[[#Heading]]` (empty target) links within the current file.
- **Embed-only modifier**: `![[image.png|300]]` — for embeds the `|...` segment is a width/size hint, not display text. The link and embed parsers are deliberately separate (`linkParser.ts` vs `embedParser.ts`) — do not unify them.

## Conventions

- `src/core/**` is pure: no I/O, no globals. Adapters do the I/O and pass data in.
- Unit tests pin **contract fields** (what consumers read), not full return shapes. Stateful/branching modules also get input→output logic-path tests.
- E2e tests assert user-observable behavior only (active editor, document text, hover content, link targets) — no internal imports, no regex/AST inspection, no preview-HTML scraping.
- Security: hot paths use `isInsideWorkspaceReal`/`RealSync` (realpath-based) for the workspace-boundary check; embed output is HTML/markdown-escaped; rename refuses filenames that would break `[[...]]` syntax; rename is gated on workspace trust.
- TDD: write the failing test, implement, commit per task.
