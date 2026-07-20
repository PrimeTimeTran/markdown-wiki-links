import * as path from 'path';

import { ParsedRef, IndexEntry } from '../types';
import { parseLinks } from '../parser/linkParser';
import { parseEmbeds } from '../parser/embedParser';
import { resolveTarget, IndexSnapshot } from '../resolver/resolveTarget';

export type RenamePair = { oldFsPath: string; newFsPath: string };
export type Replacement = { start: number; end: number; newText: string };

// Chars that would break out of [[target|display]] / [[target#fragment]] grammar.
const UNSAFE_RE = /[[\]|#\r\n]/;

export function rewriteWikiRefs(
  sourceText: string,
  fromFsPath: string,
  renames: RenamePair[],
  snap: IndexSnapshot,
): Replacement[] {
  if (renames.length === 0) return [];
  const out: Replacement[] = [];
  const refs: ParsedRef[] = [...parseLinks(sourceText), ...parseEmbeds(sourceText)];
  for (const r of refs) {
    // Same-file refs ([[#fragment]]) survive any rename of their own file by definition.
    if (r.target.trim() === '') continue;
    const resolved = resolveTarget(r, fromFsPath, snap);
    if (!resolved) continue;
    const hit = renames.find((p) => p.oldFsPath === resolved.fsPath);
    if (!hit) continue;
    const newTarget = chooseTargetForm(r.target, hit.newFsPath, snap, renames);
    if (newTarget === null) continue;
    const newText = rebuildWiki(r, newTarget);
    // Folder moves keep base names, so bare links often need no textual change — an
    // identical replacement would still dirty the referrer and pollute its undo stack.
    if (newText === sourceText.slice(r.range.start, r.range.end)) continue;
    out.push({ start: r.range.start, end: r.range.end, newText });
  }
  return out;
}

// Returns null when the new name cannot be safely inserted as wiki-link text.
function chooseTargetForm(
  oldTarget: string,
  newFsPath: string,
  snap: IndexSnapshot,
  renames: RenamePair[],
): string | null {
  const oldHadSlash = oldTarget.includes('/');
  const newBase = path.basename(newFsPath).replace(/\.(md|markdown)$/i, '');
  if (UNSAFE_RE.test(newBase)) return null;

  const effective: IndexEntry[] = snap.entries
    .filter((e) => !renames.some((r) => r.oldFsPath === e.fsPath))
    .concat(
      renames.map((r) => ({
        fsPath: r.newFsPath,
        relPath: path.relative(snap.workspaceRoot, r.newFsPath),
        baseNoExt: path.basename(r.newFsPath).replace(/\.(md|markdown)$/i, ''),
      })),
    );
  if (!oldHadSlash) {
    const collision = effective.some(
      (e) => e.fsPath !== newFsPath && e.baseNoExt.toLowerCase() === newBase.toLowerCase(),
    );
    if (!collision) return newBase;
  }
  // Slashed wiki-link targets are workspace-root-relative (the resolver suffix-matches them
  // against each file's relPath), NOT relative to the source file. Computing the path from
  // the source dir would emit `../` segments, which the resolver rejects.
  const rel = path
    .relative(snap.workspaceRoot, newFsPath)
    .replace(/\\/g, '/')
    .replace(/\.(md|markdown)$/i, '');
  // A `..` segment means the target is outside this file's workspace folder (e.g. a multi-root
  // workspace): there is no wiki-link form that can reach it, so skip the rewrite.
  if (UNSAFE_RE.test(rel) || rel.split('/').includes('..')) return null;
  return rel;
}

function rebuildWiki(r: ParsedRef, newTarget: string): string {
  const prefix = r.kind === 'embed' ? '![[' : '[[';
  let body = newTarget;
  if (r.fragment) body += '#' + r.fragment;
  if (r.kind === 'link' && r.display) body += '|' + r.display;
  if (r.kind === 'embed' && r.sizeHint) body += '|' + r.sizeHint;
  return prefix + body + ']]';
}
