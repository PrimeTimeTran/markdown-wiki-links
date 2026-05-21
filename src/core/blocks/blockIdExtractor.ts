import { buildFenceMask, isMasked } from '../fenceMask';

const SUFFIX_RE = /\s\^([A-Za-z0-9_-]+)\s*$/;
const STANDALONE_RE = /^\^([A-Za-z0-9_-]+)\s*$/;
const LIST_OR_QUOTE_RE = /^\s*([-*+>]|\d+\.)\s+/;

export function extractBlockIds(
  text: string,
): Map<string, { line: number; kind: 'suffix' | 'standalone' }> {
  const mask = buildFenceMask(text);
  const lines = text.split(/\r?\n/);
  const out = new Map<string, { line: number; kind: 'suffix' | 'standalone' }>();
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineOffset = offset;
    offset += lines[i].length + 1;
    if (isMasked(mask, lineOffset)) continue;
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) continue;
    const sa = line.match(STANDALONE_RE);
    if (sa) {
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === '') j--;
      if (j >= 0 && LIST_OR_QUOTE_RE.test(lines[j])) {
        let blockStart = j;
        while (blockStart - 1 >= 0 && LIST_OR_QUOTE_RE.test(lines[blockStart - 1])) blockStart--;
        out.set(sa[1], { line: blockStart, kind: 'standalone' });
      }
      continue;
    }
    const sf = line.match(SUFFIX_RE);
    if (sf && !/^\s*$/.test(line.replace(SUFFIX_RE, ''))) {
      out.set(sf[1], { line: i, kind: 'suffix' });
    }
  }
  return out;
}
