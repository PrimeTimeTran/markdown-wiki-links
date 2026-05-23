# Changelog

All notable changes to this extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
