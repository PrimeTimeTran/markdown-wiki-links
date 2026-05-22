// A YAML frontmatter block: `---` on the very first line, content, then a closing `---` line.
const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

// Remove a leading YAML frontmatter block, if present. Used when rendering a file's
// content for embed/hover preview so the raw `key: value` lines are not shown.
export function stripFrontmatter(text: string): string {
  return text.replace(FRONTMATTER_RE, '');
}

// Split a leading YAML frontmatter block from the body. When there is no frontmatter the
// frontmatter part is empty and the body is the whole input. Used to keep wiki-link rewriting
// out of the metadata block, where a `[[...]]` value must stay verbatim valid YAML.
export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: '', body: text };
  return { frontmatter: match[0], body: text.slice(match[0].length) };
}
