import { buildFenceMask, isMasked } from '../fenceMask';
import { ParsedRef } from '../types';

const LINK_RE =
  /(?<!!)\[\[(?<target>[^[\]|#\r\n]*)(?:#(?<fragment>[^[\]|\r\n]+))?(?:\|(?<display>[^[\]\r\n]+))?\]\]/g;

export function parseLinks(text: string): ParsedRef[] {
  const mask = buildFenceMask(text);
  const refs: ParsedRef[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    if (isMasked(mask, start)) continue;
    const g = m.groups as { target: string; fragment?: string; display?: string };
    refs.push({
      kind: 'link',
      target: g.target.trim(),
      fragment: g.fragment?.trim(),
      display: g.display?.trim(),
      range: { start, end: start + m[0].length },
    });
  }
  return refs;
}
