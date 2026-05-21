import { extractHeadings, slugify } from './headingExtractor';
import { extractBlockIds } from './blockIdExtractor';

export function lineForFragment(fragment: string, text: string): number | undefined {
  if (fragment.startsWith('^')) return extractBlockIds(text).get(fragment.slice(1))?.line;
  const slug = slugify(fragment);
  const h = extractHeadings(text).find((h) => h.text === fragment || h.slug === slug);
  return h?.line;
}

export function sliceSection(fragment: string, text: string): string {
  const lines = text.split(/\r?\n/);
  if (fragment.startsWith('^')) {
    const at = extractBlockIds(text).get(fragment.slice(1));
    if (!at) return '';
    let end = at.line;
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++;
    return lines.slice(at.line, end + 1).join('\n');
  }
  const slug = slugify(fragment);
  const h = extractHeadings(text).find((x) => x.text === fragment || x.slug === slug);
  if (!h) return '';
  const next = extractHeadings(text).find((x) => x.line > h.line);
  return lines.slice(h.line, next?.line ?? lines.length).join('\n');
}
