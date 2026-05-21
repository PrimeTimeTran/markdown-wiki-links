export type Interval = { start: number; end: number };
export type FenceMask = Interval[];

export function buildFenceMask(text: string): FenceMask {
  const out: Interval[] = [];
  const lines = text.split(/\r?\n/);
  let offset = 0;
  let inFence: '```' | '~~~' | null = null;
  let fenceStart = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (inFence) {
      if (trimmed.startsWith(inFence)) {
        out.push({ start: fenceStart, end: offset + line.length });
        inFence = null;
      }
    } else if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = trimmed.startsWith('```') ? '```' : '~~~';
      fenceStart = offset;
    }
    offset += line.length + 1;
  }
  if (inFence) out.push({ start: fenceStart, end: text.length });

  for (let i = 0; i < text.length; i++) {
    if (isInsideAny(out, i)) continue;
    if (text[i] === '`') {
      const close = text.indexOf('`', i + 1);
      if (close === -1) break;
      out.push({ start: i, end: close + 1 });
      i = close;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function isMasked(mask: FenceMask, offset: number): boolean {
  return isInsideAny(mask, offset);
}

function isInsideAny(mask: FenceMask, offset: number): boolean {
  for (const iv of mask) if (offset >= iv.start && offset < iv.end) return true;
  return false;
}
