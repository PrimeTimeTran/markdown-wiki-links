import * as fs from 'fs';

import * as vscode from 'vscode';

import { resolveTarget } from '../core/resolver/resolveTarget';
import { sliceSection } from '../core/blocks/sectionSlice';
import { ResolveFn, Resolved } from '../markdownItPlugin/embedRule';

import { IndexService } from './indexService';
import { isInsideWorkspaceRealSync } from './workspaceBoundary';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function createPreviewEmbedResolver(idx: IndexService): ResolveFn {
  // markdown-it is synchronous so the resolver must be sync. Use the sync realpath variant.
  return (key) => {
    const [target, fragment] = key.split('#');
    const snap = idx.snapshotFor(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '');
    if (IMAGE_RE.test(target)) return resolveImage(target, snap);
    return resolveMarkdown(target, fragment, snap);
  };
}

function resolveImage(
  target: string,
  snap: ReturnType<IndexService['snapshotFor']>,
): Resolved | null {
  const hit = snap.entries.find((e) => e.relPath.toLowerCase().endsWith(target.toLowerCase()));
  if (!hit) return null;
  const uri = vscode.Uri.file(hit.fsPath);
  if (!isInsideWorkspaceRealSync(uri)) return null;
  return { kind: 'image', src: uri.toString() };
}

function resolveMarkdown(
  target: string,
  fragment: string | undefined,
  snap: ReturnType<IndexService['snapshotFor']>,
): Resolved | null {
  const resolved = resolveTarget(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { kind: 'embed', target, fragment, range: { start: 0, end: 0 } } as any,
    snap.workspaceRoot,
    snap,
  );
  if (!resolved || !isInsideWorkspaceRealSync(vscode.Uri.file(resolved.fsPath))) return null;
  try {
    const full = fs.readFileSync(resolved.fsPath, 'utf8');
    const text = fragment ? sliceSection(fragment, full) || full : full;
    return { kind: 'markdown', text, sourcePath: resolved.fsPath };
  } catch {
    return null;
  }
}
