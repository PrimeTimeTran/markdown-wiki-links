// Offset → line/character conversion for raw text, matching VSCode's TextDocument.positionAt
// semantics (line breaks: \n, \r\n, and lone \r). Lets adapters build editor Ranges from
// file bytes without instantiating a TextDocument. Pure: no vscode.

export type LineCharacter = { line: number; character: number };

export function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 /* \n */) starts.push(i + 1);
    else if (c === 13 /* \r */ && text.charCodeAt(i + 1) !== 10) starts.push(i + 1);
  }
  return starts;
}

export function positionAt(lineStarts: readonly number[], offset: number): LineCharacter {
  // Binary search for the greatest line start <= offset.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, character: offset - lineStarts[lo] };
}
