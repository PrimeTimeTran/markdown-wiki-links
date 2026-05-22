import * as path from 'path';

import { resolveTarget, IndexSnapshot } from '../resolver/resolveTarget';

export type Candidate = {
  fsPath: string;
  label: string;
  insertText: string;
  detail: string;
  score: number;
};

export function rankCompletions(
  query: string,
  fromFsPath: string,
  idx: IndexSnapshot,
): Candidate[] {
  const q = query.trim().toLowerCase();
  const fromDir = path.dirname(fromFsPath);

  const matches = idx.entries.filter((e) => {
    if (e.fsPath === fromFsPath) return false;
    if (q === '') return true;
    if (e.baseNoExt.toLowerCase().startsWith(q)) return true;
    return e.relPath
      .toLowerCase()
      .split('/')
      .some((seg) => seg.startsWith(q));
  });

  return matches
    .map((m) => ({
      fsPath: m.fsPath,
      label: m.baseNoExt,
      insertText: chooseInsertText(m.baseNoExt, m.relPath, m.fsPath, fromFsPath, idx),
      detail: m.relPath,
      score: commonAncestorDepth(fromDir, path.dirname(m.fsPath)),
    }))
    .sort((a, b) => b.score - a.score || a.insertText.localeCompare(b.insertText));
}

// Choose the shortest insertText that resolves back to this exact file under the resolver,
// so the completion stays consistent with the resolver's tiebreakers.
function chooseInsertText(
  baseNoExt: string,
  relPath: string,
  fsPath: string,
  fromFsPath: string,
  idx: IndexSnapshot,
): string {
  const bareResolved = resolveTarget(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { kind: 'link', target: baseNoExt, range: { start: 0, end: 0 } } as any,
    fromFsPath,
    idx,
  );
  if (bareResolved?.fsPath === fsPath) return baseNoExt;
  return relPath.replace(/\.(md|markdown)$/i, '');
}

function commonAncestorDepth(a: string, b: string): number {
  const sa = a.split(path.sep);
  const sb = b.split(path.sep);
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return i;
}
