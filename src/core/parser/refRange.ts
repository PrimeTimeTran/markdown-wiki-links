import { ParsedRef } from '../types';

// Source offsets of the content between the brackets — excludes the `[[` / `![[` prefix and
// the `]]` suffix. Used to decorate the link text without recolouring the brackets.
export function innerRange(ref: ParsedRef): { start: number; end: number } {
  const prefix = ref.kind === 'embed' ? 3 : 2; // `![[` vs `[[`
  return { start: ref.range.start + prefix, end: ref.range.end - 2 };
}
