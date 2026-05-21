# VSCode extension for enabling Wiki-links in Markdown files

This extension brings Obsidian-style wiki-links to VSCode. Create links between Markdown files with a simple `[[file name]]` syntax, follow them with a click, preview them on hover, embed content inline with `![[...]]`, and keep links correct automatically when files are renamed.

https://obsidian.md/help/links

## Wiki-link Syntax

Use `[[wiki-link]]` for markdown and media files within the workspace only.

<!-- prettier-ignore -->
```markdown
[[file name]]                          Link to file
[[file name|Display Text]]             Custom display text
[[file name#Heading]]                  Link to heading
[[file name#^block-id]]                Link to block
[[#Heading in same file]]              Same-file heading link
```

Define a block ID by appending `^block-id` to any paragraph:

```markdown
This paragraph can be linked to. ^my-block-id
```

For lists and quotes, place the block ID on a separate line after the block:

```markdown
> A quote block

^quote-id
```

Prefix any wikilink with `!` to embed its content inline:

<!-- prettier-ignore -->
```markdown
![[file name]]                         Embed full file
![[file name#Heading]]                 Embed section
![[image.png]]                         Embed image
![[image.png|300]]                     Embed image with width
```

## Features

- Support `.md` and `.markdown` file extensions.
- Click to follow the link (headings and block IDs jump to the right line).
- Hover to preview the linked file or section; hovering an image embed previews the image.
- Autocomplete file names while typing `[[` or `![[`, ranked by closest folder.
- Auto update links when renaming files.
- Inline embeds (`![[...]]`) rendered in the Markdown preview, with cycle protection.
- Diagnostics flag broken or ambiguous wiki-links.
- Support both unique file name and relative file name resolution:
  - A bare `[[file name]]` resolves by unique base name across the workspace. If the name is ambiguous, a file directly under the workspace root wins; otherwise resolution walks up from the current file to the closest parent folder containing a match.
  - A relative `[[folder1/folder2/file name]]` resolves to the unique file whose path ends with `folder1/folder2/file name.md` (or `.markdown`). If more than one file matches, the link is left unresolved.
  - `..` segments and absolute paths are not allowed — links never resolve outside the workspace.

## Development

Requires Node.js and pnpm.

```sh
pnpm install        # install dependencies
pnpm build          # bundle the extension into dist/
pnpm test           # lint, build, then run unit + end-to-end tests
pnpm test:unit      # fast pure-logic unit tests
pnpm test:e2e       # end-to-end tests in a real VSCode Extension Development Host
```

Press `F5` in VSCode to launch the extension in an Extension Development Host for manual testing.
