import * as path from 'path';

import { resolveTarget, stripMdExt, IndexSnapshot } from '../resolver/resolveTarget';

export type Candidate = {
  fsPath: string;
  label: string;
  insertText: string;
  // Closest distinguishing parent folder(s) (e.g. "sub1/"), set ONLY when the label is
  // duplicated among the results. Shows just enough trailing path segments to tell the
  // same-named files apart — the shared prefix up to the root is omitted. Undefined for
  // unambiguous candidates.
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
    insertText: chooseInsertText(m.relPath, m.fsPath, fromFsPath, idx),
    score: commonAncestorDepth(fromDir, path.dirname(m.fsPath)),
  }));

  // A name is "duplicated" when it appears on more than one candidate in this result set.
  // Each such group gets a folder description showing only the closest parent segments that
  // tell its members apart — the prefix they all share (up to the root) is dropped.
  const groups = new Map<string, number[]>();
  ranked.forEach((c, i) => {
    const key = c.label.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  });
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const dirs = indices.map((i) => dirSegments(matches[i].relPath));
    const depth = distinguishingDepth(dirs);
    indices.forEach((rankedIndex, j) => {
      ranked[rankedIndex].description = suffixLabel(dirs[j], depth);
    });
  }

  return ranked.sort((a, b) => b.score - a.score || a.insertText.localeCompare(b.insertText));
}

// The directory portion of a relative path as POSIX segments. A workspace-root file has none.
function dirSegments(relPath: string): string[] {
  const dir = path.dirname(relPath).replace(/\\/g, '/');
  return dir === '.' || dir === '' ? [] : dir.split('/');
}

// Smallest number of trailing segments that makes every directory in the group distinct.
// Falls back to the deepest path when no suffix can separate them (e.g. dup.md vs dup.markdown
// in the same folder).
function distinguishingDepth(dirs: string[][]): number {
  const maxLen = Math.max(...dirs.map((d) => d.length));
  for (let k = 1; k <= maxLen; k++) {
    const suffixes = dirs.map((d) => d.slice(-k).join('/'));
    if (new Set(suffixes).size === dirs.length) return k;
  }
  return Math.max(maxLen, 1);
}

// The last `depth` directory segments, POSIX-style with a trailing slash.
// A workspace-root file has no segments, so it reads as "/".
function suffixLabel(dir: string[], depth: number): string {
  const suffix = dir.slice(-depth);
  return suffix.length === 0 ? '/' : `${suffix.join('/')}/`;
}

// Choose the shortest target text the user can type that the resolver maps back to this exact
// file: the bare name if it resolves uniquely, else the shortest trailing path suffix that does
// (the closest-parent strategy). The full relative path is only the last resort.
function chooseInsertText(
  relPath: string,
  fsPath: string,
  fromFsPath: string,
  idx: IndexSnapshot,
): string {
  const noExt = stripMdExt(relPath.replace(/\\/g, '/'));
  const segments = noExt.split('/');
  for (let depth = 1; depth <= segments.length; depth++) {
    const candidate = segments.slice(-depth).join('/');
    const resolved = resolveTarget(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { kind: 'link', target: candidate, range: { start: 0, end: 0 } } as any,
      fromFsPath,
      idx,
    );
    if (resolved?.fsPath === fsPath) return candidate;
  }
  return noExt;
}

function commonAncestorDepth(a: string, b: string): number {
  const sa = a.split(path.sep);
  const sb = b.split(path.sep);
  let i = 0;
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  return i;
}
