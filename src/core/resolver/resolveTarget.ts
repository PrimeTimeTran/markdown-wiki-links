import * as path from 'path';

import { IndexEntry, ParsedRef, ResolvedTarget } from '../types';

export type IndexSnapshot = { entries: IndexEntry[]; workspaceRoot: string };

export function resolveTarget(
  ref: ParsedRef,
  fromFsPath: string,
  idx: IndexSnapshot,
): ResolvedTarget | null {
  const t = ref.target.trim();
  if (t === '') return { fsPath: fromFsPath };

  if (/^[/\\]/.test(t) || /^[A-Za-z]:/.test(t)) return null;
  if (t.split(/[\\/]/).some((seg) => seg === '..')) return null;

  const norm = t
    .replace(/\\/g, '/')
    .replace(/\.(md|markdown)$/i, '')
    .toLowerCase();

  const inWorkspace = idx.entries.filter((e) => isContained(e.fsPath, idx.workspaceRoot));

  if (norm.includes('/')) return uniqueSuffixMatch(norm, inWorkspace);

  const baseMatches = inWorkspace.filter((e) => e.baseNoExt.toLowerCase() === norm);
  if (baseMatches.length === 1) return { fsPath: baseMatches[0].fsPath };
  if (baseMatches.length === 0) return null;

  const rootLevel = baseMatches.filter((e) => path.dirname(e.fsPath) === idx.workspaceRoot);
  if (rootLevel.length === 1) return { fsPath: rootLevel[0].fsPath };

  return walkAncestorsForBare(norm, fromFsPath, { ...idx, entries: inWorkspace });
}

function uniqueSuffixMatch(norm: string, entries: IndexEntry[]): ResolvedTarget | null {
  const hits = entries.filter((e) => {
    const rel = e.relPath.toLowerCase().replace(/\.(md|markdown)$/, '');
    return rel === norm || rel.endsWith('/' + norm);
  });
  return hits.length === 1 ? { fsPath: hits[0].fsPath } : null;
}

function walkAncestorsForBare(
  norm: string,
  fromFsPath: string,
  idx: IndexSnapshot,
): ResolvedTarget | null {
  const fromDir = path.dirname(fromFsPath);
  if (!isContained(fromDir, idx.workspaceRoot)) return null;
  let cur = fromDir;
  while (isContained(cur, idx.workspaceRoot)) {
    for (const ext of ['md', 'markdown']) {
      const candidate = path.join(cur, `${norm}.${ext}`);
      const hit = idx.entries.find((e) => e.fsPath.toLowerCase() === candidate.toLowerCase());
      if (hit) return { fsPath: hit.fsPath };
    }
    if (cur === idx.workspaceRoot) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function isContained(p: string, root: string): boolean {
  return p === root || p.startsWith(root + path.sep);
}
