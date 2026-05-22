import * as path from 'path';

import { resolveTarget, IndexSnapshot } from '../resolver/resolveTarget';

export type Candidate = {
  fsPath: string;
  label: string;
  insertText: string;
  // Parent-folder path (e.g. "Inbox/"), set ONLY when the label is duplicated among the
  // results so the user can tell same-named files apart. The file name is omitted - it is
  // already the label. Undefined for unambiguous candidates.
  description?: string;
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

  const ranked: Candidate[] = matches.map((m) => ({
    fsPath: m.fsPath,
    label: m.baseNoExt,
    insertText: chooseInsertText(m.baseNoExt, m.relPath, m.fsPath, fromFsPath, idx),
    score: commonAncestorDepth(fromDir, path.dirname(m.fsPath)),
  }));

  // A name is "duplicated" when it appears on more than one candidate in this result set;
  // those candidates get a folder description so the popup disambiguates them inline.
  const nameCounts = new Map<string, number>();
  for (const c of ranked) {
    const key = c.label.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  ranked.forEach((c, i) => {
    if ((nameCounts.get(c.label.toLowerCase()) ?? 0) > 1) {
      c.description = folderLabel(matches[i].relPath);
    }
  });

  return ranked.sort((a, b) => b.score - a.score || a.insertText.localeCompare(b.insertText));
}

// The directory portion of a relative path, POSIX-style with a trailing slash.
// A workspace-root file has no directory, so it reads as "/".
function folderLabel(relPath: string): string {
  const dir = path.dirname(relPath).replace(/\\/g, '/');
  return dir === '.' ? '/' : `${dir}/`;
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
