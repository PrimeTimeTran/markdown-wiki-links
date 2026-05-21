import { buildFenceMask, isMasked } from '../fenceMask';
import { ParsedRef } from '../types';

const EMBED_RE =
  /!\[\[(?<target>[^[\]|#\r\n]+)(?:#(?<fragment>[^[\]|\r\n]+))?(?:\|(?<sizeHint>[^[\]\r\n]+))?\]\]/g;

export function parseEmbeds(text: string): ParsedRef[] {
  const mask = buildFenceMask(text);
  const refs: ParsedRef[] = [];
  for (const m of text.matchAll(EMBED_RE)) {
    const start = m.index ?? 0;
    if (isMasked(mask, start)) continue;
    const g = m.groups as { target: string; fragment?: string; sizeHint?: string };
    refs.push({
      kind: 'embed',
      target: g.target.trim(),
      fragment: g.fragment?.trim(),
      sizeHint: g.sizeHint?.trim(),
      range: { start, end: start + m[0].length },
    });
  }
  return refs;
}
