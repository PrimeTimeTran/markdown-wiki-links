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

// Strips the Markdown extension a wiki-link may omit. Media extensions stay: [[pic.png]]
// must keep its extension to resolve.
export function stripMdExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '');
}

// The one way IndexEntry objects should be built. The live index, the rename-time snapshot,
// and the synthesized post-rename entries must all agree on relPath/baseNoExt semantics, or
// rename verification is judged against entries the resolver would never produce.
export function makeIndexEntry(fsPath: string, root: string): IndexEntry {
  return {
    fsPath,
    relPath: path.relative(root, fsPath),
    baseNoExt: stripMdExt(path.basename(fsPath)),
  };
}

export function resolveTarget(
  // Only the target text participates in resolution — declaring that makes bare probe
  // objects ({ target }) legal without casts, and keeps fragment/display/range inert here.
  ref: Pick<ParsedRef, 'target'>,
  fromFsPath: string,
  idx: IndexSnapshot,
): ResolvedTarget | null {
  const t = ref.target.trim();
  if (t === '') return { fsPath: fromFsPath };

  if (/^[/\\]/.test(t) || /^[A-Za-z]:/.test(t)) return null;
  if (t.split(/[\\/]/).some((seg) => seg === '..')) return null;

  const norm = stripMdExt(t.replace(/\\/g, '/')).toLowerCase();

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

// Segment-safe suffix match of a forward-slash link target against an entry relPath (which
// uses platform separators — backslashes on Windows). Shared by the resolver and the preview
// so both sides agree on which files a slashed target can mean.
export function relSuffixMatches(relPath: string, target: string): boolean {
  const rel = relPath.replace(/\\/g, '/').toLowerCase();
  const t = target.toLowerCase();
  return rel === t || rel.endsWith('/' + t);
}

function uniqueSuffixMatch(norm: string, entries: IndexEntry[]): ResolvedTarget | null {
  // norm is already extension-stripped, so strip the entry side too before matching.
  const hits = entries.filter((e) => relSuffixMatches(stripMdExt(e.relPath), norm));
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
