import * as path from 'path';

import { IndexEntry, ParsedRef, ResolvedTarget } from '../types';

// Precomputed maps over the in-workspace entries so resolution is O(candidates) per link
// instead of O(all entries). Build once per snapshot with buildLookup; when present it is
// authoritative and `entries` is not read by resolveTarget.
export type SnapshotLookup = {
  /** lowercased baseNoExt → entries with that base name */
  byBase: Map<string, IndexEntry[]>;
  /** lowercased fsPath → entry (for the ancestor-walk candidate probe) */
  byFsPathLower: Map<string, IndexEntry>;
};

export type IndexSnapshot = {
  entries: IndexEntry[];
  workspaceRoot: string;
  lookup?: SnapshotLookup;
};

export function buildLookup(entries: IndexEntry[], workspaceRoot: string): SnapshotLookup {
  const byBase = new Map<string, IndexEntry[]>();
  const byFsPathLower = new Map<string, IndexEntry>();
  for (const e of entries) {
    if (!isContained(e.fsPath, workspaceRoot)) continue;
    const key = e.baseNoExt.toLowerCase();
    const bucket = byBase.get(key);
    if (bucket) bucket.push(e);
    else byBase.set(key, [e]);
    byFsPathLower.set(e.fsPath.toLowerCase(), e);
  }
  return { byBase, byFsPathLower };
}

// The one way snapshots should be built: entries plus the precomputed lookup. Constructing
// the object by hand and forgetting `lookup` silently reverts resolution to a per-call
// lookup rebuild (see the fallback in resolveTarget).
export function createSnapshot(entries: IndexEntry[], workspaceRoot: string): IndexSnapshot {
  return { entries, workspaceRoot, lookup: buildLookup(entries, workspaceRoot) };
}

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

  const lookup = idx.lookup ?? buildLookup(idx.entries, idx.workspaceRoot);

  if (norm.includes('/')) {
    // Any rel-path suffix match necessarily shares the target's last segment as its base
    // name, so only the entries under that base-name key need the full suffix test.
    const lastSegment = norm.split('/').pop() ?? '';
    const candidates = lookup.byBase.get(lastSegment) ?? [];
    return uniqueSuffixMatch(norm, candidates);
  }

  const baseMatches = lookup.byBase.get(norm) ?? [];
  if (baseMatches.length === 1) return { fsPath: baseMatches[0].fsPath };
  if (baseMatches.length === 0) return null;

  const rootLevel = baseMatches.filter((e) => path.dirname(e.fsPath) === idx.workspaceRoot);
  if (rootLevel.length === 1) return { fsPath: rootLevel[0].fsPath };

  return walkAncestorsForBare(norm, fromFsPath, idx.workspaceRoot, lookup);
}

function uniqueSuffixMatch(norm: string, entries: IndexEntry[]): ResolvedTarget | null {
  const hits = entries.filter((e) => {
    // relPath comes from path.relative, which uses backslashes on Windows; norm is
    // forward-slash-normalized, so the entry side must be normalized the same way.
    const rel = e.relPath
      .replace(/\\/g, '/')
      .toLowerCase()
      .replace(/\.(md|markdown)$/, '');
    return rel === norm || rel.endsWith('/' + norm);
  });
  return hits.length === 1 ? { fsPath: hits[0].fsPath } : null;
}

function walkAncestorsForBare(
  norm: string,
  fromFsPath: string,
  workspaceRoot: string,
  lookup: SnapshotLookup,
): ResolvedTarget | null {
  const fromDir = path.dirname(fromFsPath);
  if (!isContained(fromDir, workspaceRoot)) return null;
  let cur = fromDir;
  while (isContained(cur, workspaceRoot)) {
    for (const ext of ['md', 'markdown']) {
      const candidate = path.join(cur, `${norm}.${ext}`);
      const hit = lookup.byFsPathLower.get(candidate.toLowerCase());
      if (hit) return { fsPath: hit.fsPath };
    }
    if (cur === workspaceRoot) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export function isContained(p: string, root: string): boolean {
  return p === root || p.startsWith(root + path.sep);
}
