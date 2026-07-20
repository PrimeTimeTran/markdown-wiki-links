import * as path from 'path';

import { ParsedRef, IndexEntry } from '../types';
import { parseLinks } from '../parser/linkParser';
import { parseEmbeds } from '../parser/embedParser';
import { resolveTarget, createSnapshot, IndexSnapshot } from '../resolver/resolveTarget';

export type RenamePair = { oldFsPath: string; newFsPath: string };
export type Replacement = { start: number; end: number; newText: string };

// Everything about a rename batch that is constant across referrers: the old-path map and
// the post-rename ("effective") snapshot with its lookup. Build once per workspace root and
// pass to rewriteWikiRefs so per-ref work stays O(candidates), not O(entries × renames).
export type RenameContext = {
  renameByOld: Map<string, RenamePair>;
  effective: IndexSnapshot;
};

export function buildRenameContext(renames: RenamePair[], snap: IndexSnapshot): RenameContext {
  // First pair wins on duplicate old paths (matches the previous renames.find semantics).
  const renameByOld = new Map<string, RenamePair>();
  for (const p of renames) if (!renameByOld.has(p.oldFsPath)) renameByOld.set(p.oldFsPath, p);
  const entries: IndexEntry[] = snap.entries
    .filter((e) => !renameByOld.has(e.fsPath))
    .concat(
      [...renameByOld.values()].map((r) => ({
        fsPath: r.newFsPath,
        relPath: path.relative(snap.workspaceRoot, r.newFsPath),
        baseNoExt: path.basename(r.newFsPath).replace(/\.(md|markdown)$/i, ''),
      })),
    );
  return { renameByOld, effective: createSnapshot(entries, snap.workspaceRoot) };
}

// Chars that would break out of [[target|display]] / [[target#fragment]] grammar.
const UNSAFE_RE = /[[\]|#\r\n]/;

export function rewriteWikiRefs(
  sourceText: string,
  fromFsPath: string,
  renames: RenamePair[],
  snap: IndexSnapshot,
  ctx?: RenameContext,
): Replacement[] {
  if (renames.length === 0) return [];
  const c = ctx ?? buildRenameContext(renames, snap);
  // The referrer itself may be part of the batch — resolution must be judged from where
  // the file will live after the rename, or links resolved via the ancestor walk silently
  // retarget when their own file moves.
  const newFrom = c.renameByOld.get(fromFsPath)?.newFsPath ?? fromFsPath;
  const out: Replacement[] = [];
  const refs: ParsedRef[] = [...parseLinks(sourceText), ...parseEmbeds(sourceText)];
  for (const r of refs) {
    // Same-file refs ([[#fragment]]) survive any rename of their own file by definition.
    if (r.target.trim() === '') continue;
    const resolved = resolveTarget(r, fromFsPath, snap);
    if (!resolved) continue;
    const finalFsPath = c.renameByOld.get(resolved.fsPath)?.newFsPath ?? resolved.fsPath;
    // If the existing text still resolves to the same file from the post-rename location,
    // no edit is needed — this also keeps non-canonical forms ([[Note]], [[note.md]])
    // untouched instead of churning them to the canonical spelling.
    const still = resolveTarget(r, newFrom, c.effective);
    if (still?.fsPath === finalFsPath) continue;
    const newTarget = chooseTargetForm(r.target, finalFsPath, newFrom, c.effective);
    if (newTarget === null) continue;
    const newText = rebuildWiki(r, newTarget);
    if (newText === sourceText.slice(r.range.start, r.range.end)) continue;
    out.push({ start: r.range.start, end: r.range.end, newText });
  }
  return out;
}

// Picks the wiki-link text that resolves to finalFsPath from newFrom in the post-rename
// workspace. Returns null when no safe form exists (unsafe characters, or the target is
// outside this file's workspace folder).
function chooseTargetForm(
  oldTarget: string,
  finalFsPath: string,
  newFrom: string,
  effective: IndexSnapshot,
): string | null {
  const oldHadSlash = oldTarget.includes('/');
  const newBase = path.basename(finalFsPath).replace(/\.(md|markdown)$/i, '');
  if (UNSAFE_RE.test(newBase)) return null;

  // Prefer keeping the author's form: bare stays bare when the bare name actually resolves
  // to the intended file (resolution-verified, so root preference and the ancestor walk
  // count — not just a naive base-name collision test).
  if (!oldHadSlash && resolvesTo(newBase, newFrom, effective, finalFsPath)) return newBase;

  // Slashed wiki-link targets are workspace-root-relative (the resolver suffix-matches them
  // against each file's relPath), NOT relative to the source file. Computing the path from
  // the source dir would emit `../` segments, which the resolver rejects.
  const rel = path
    .relative(effective.workspaceRoot, finalFsPath)
    .replace(/\\/g, '/')
    .replace(/\.(md|markdown)$/i, '');
  // A `..` segment means the target is outside this file's workspace folder (e.g. a multi-root
  // workspace): there is no wiki-link form that can reach it, so skip the rewrite.
  if (UNSAFE_RE.test(rel) || rel.split('/').includes('..')) return null;
  return rel;
}

function resolvesTo(
  target: string,
  fromFsPath: string,
  snap: IndexSnapshot,
  wantFsPath: string,
): boolean {
  const probe = { target } as ParsedRef;
  return resolveTarget(probe, fromFsPath, snap)?.fsPath === wantFsPath;
}

function rebuildWiki(r: ParsedRef, newTarget: string): string {
  const prefix = r.kind === 'embed' ? '![[' : '[[';
  let body = newTarget;
  if (r.fragment) body += '#' + r.fragment;
  if (r.kind === 'link' && r.display) body += '|' + r.display;
  if (r.kind === 'embed' && r.sizeHint) body += '|' + r.sizeHint;
  return prefix + body + ']]';
}
