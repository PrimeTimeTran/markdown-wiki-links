# Changelog

All notable changes to this extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Slashed links (`[[folder/note]]`) now resolve on Windows; backslash relative
  paths were never matched against the forward-slash link form.
- Rename rewriting is encoding-safe: files whose bytes are not clean UTF-8
  (UTF-16 with or without BOM, legacy codepages) and workspaces with a
  non-UTF-8 `files.encoding` now go through VSCode's own decoder, so rewrites
  are neither silently skipped nor spliced at wrong offsets.
- Rename rewriting is now resolution-verified — each link is re-resolved from
  its post-rename location against the post-rename index and rewritten exactly
  when its resolution would change. Links inside a moved folder that resolved
  via the closest-parent walk are re-anchored to keep their original target,
  links that an incoming rename would make ambiguous are pinned to theirs, and
  still-resolving variants (`[[Case]]`, `[[name.md]]`) are no longer churned.

- Moving or renaming a **folder** now rewrites wiki-links to the files inside
  it. Previously folder operations were ignored entirely, silently breaking
  every link into the moved folder.

- Renaming or moving a linked file no longer freezes the editor for many
  seconds in large workspaces. The rename participant previously opened every
  Markdown file in the workspace one at a time (each open also triggering a
  diagnostics pass) while resolving every link with a linear scan of the index.
  It now reads only the files that can possibly reference the renamed target,
  in parallel and without opening editor documents, and link resolution runs
  through a precomputed index lookup.

- In a multi-root workspace, a sibling folder sharing a name prefix (`/ws/doc`
  vs `/ws/docs`) no longer leaks its files into the other root's completion
  and rename-collision checks.

### Changed

- Rename link-rewriting now honors `wikiLinks.index.excludeFolders` (matching
  the index) instead of only skipping `node_modules`.
- Index snapshots (used by links, hovers, completion, diagnostics, decorations,
  and the preview) are cached per workspace root and rebuilt only when the
  index changes, instead of being recomputed on every request.

## [0.1.0] - 2026-05-24

Initial release. Workspace-local Obsidian-style `[[wiki-links]]` and `![[embeds]]`
between Markdown files.

### Added

- Click-to-follow `[[file]]`, `[[file#Heading]]`, `[[file#^block-id]]`,
  `[[#same-file-heading]]`, and `[[file|display text]]`.
- Hover preview of the linked file, section, or block — with inline image
  preview for `![[image.png]]` and an optional `|width` size hint.
- `![[...]]` embeds rendered inline in the Markdown preview, with depth cap
  and ancestor-cycle protection.
- Rename-aware link rewriting: renaming a Markdown or media file via the
  Explorer updates every `[[...]]` reference across the workspace.
- Wiki-link autocomplete after `[[` / `![[` (file names) and after `#`
  (headings + block IDs, with H1/H2/... level shown).
- Resolution-based editor coloring: ambiguous or broken refs render plain,
  resolved refs render as navigable links.
- Workspace-local boundary: refs never resolve outside the workspace,
  including via symlinks (realpath-checked on hot paths).
- Diagnostics (Information severity) for unresolved or ambiguous refs.
- Configurable: `wikiLinks.embed.maxDepth`, `wikiLinks.indexMaxFiles`,
  `wikiLinks.hover.imageMaxHeight`, `wikiLinks.index.excludeFolders`.

### Security

- Workspace trust gate on rename rewrites (disk-modifying operation).
- HTML/Markdown escaping on every user-controlled string interpolated into
  preview output.
- Renamed-to filenames containing `[` `]` `|` `#` or newlines are refused
  (they would break `[[...]]` syntax).

[0.1.0]: https://github.com/ltvan/markdown-wiki-links/releases/tag/v0.1.0
