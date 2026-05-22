// A YAML frontmatter block: `---` on the very first line, content, then a closing `---` line.
const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

// Remove a leading YAML frontmatter block, if present. Used when rendering a file's
// content for embed/hover preview so the raw `key: value` lines are not shown.
export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER_RE, '');
}
