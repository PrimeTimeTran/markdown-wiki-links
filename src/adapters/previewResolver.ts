import * as fs from 'fs';
import * as path from 'path';

import * as vscode from 'vscode';

import { resolveTarget, IndexSnapshot } from '../core/resolver/resolveTarget';
import { sliceSection } from '../core/blocks/sectionSlice';
import { slugify } from '../core/blocks/headingExtractor';
import { stripFrontmatter } from '../core/frontmatter';
import { EmbedResolved, WikiResolver } from '../markdownItPlugin/wikiRule';

import { IndexService } from './indexService';
import { isInsideWorkspaceRealSync } from './workspaceBoundary';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function createPreviewResolver(idx: IndexService): WikiResolver {
  // markdown-it is synchronous, so every resolver method is sync.
  return {
    resolveEmbed: (fromFsPath, key, sizeHint) => {
      const [target, fragment] = key.split('#');
      const snap = snapshotFrom(idx, fromFsPath);
      if (IMAGE_RE.test(target)) return resolveImage(target, snap, sizeHint);
      return resolveMarkdownEmbed(target, fragment, snap, basePath(fromFsPath, snap));
    },
    resolveLink: (fromFsPath, target, fragment) => {
      const snap = snapshotFrom(idx, fromFsPath);
      const from = basePath(fromFsPath, snap);
      if (target === '') {
        // Same-file fragment link.
        return fragment ? '#' + slugify(fragment.replace(/^\^/, '')) : null;
      }
      const resolved = resolveTarget(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { kind: 'link', target, fragment, range: { start: 0, end: 0 } } as any,
        from,
        snap,
      );
      if (!resolved || !isInsideWorkspaceRealSync(vscode.Uri.file(resolved.fsPath))) return null;
      let href = path.relative(path.dirname(from), resolved.fsPath).split(path.sep).join('/');
      // Heading fragments map to preview anchors; block-id fragments have no preview anchor.
      if (fragment && !fragment.startsWith('^')) href += '#' + slugify(fragment);
      return href;
    },
  };
}

function snapshotFrom(idx: IndexService, fromFsPath: string): IndexSnapshot {
  return idx.snapshotFor(fromFsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
}

function basePath(fromFsPath: string, snap: IndexSnapshot): string {
  return fromFsPath || path.join(snap.workspaceRoot, '_.md');
}

function resolveImage(
  target: string,
  snap: IndexSnapshot,
  sizeHint?: string,
): EmbedResolved | null {
  const hit = snap.entries.find((e) => e.relPath.toLowerCase().endsWith(target.toLowerCase()));
  if (!hit) return null;
  const uri = vscode.Uri.file(hit.fsPath);
  if (!isInsideWorkspaceRealSync(uri)) return null;
  void sizeHint;
  return { kind: 'image', src: uri.toString() };
}

function resolveMarkdownEmbed(
  target: string,
  fragment: string | undefined,
  snap: IndexSnapshot,
  fromFsPath: string,
): EmbedResolved | null {
  const resolved = resolveTarget(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { kind: 'embed', target, fragment, range: { start: 0, end: 0 } } as any,
    fromFsPath,
    snap,
  );
  if (!resolved || !isInsideWorkspaceRealSync(vscode.Uri.file(resolved.fsPath))) return null;
  try {
    const full = fs.readFileSync(resolved.fsPath, 'utf8');
    const text = fragment ? sliceSection(fragment, full) || full : stripFrontmatter(full);
    return { kind: 'markdown', text, sourcePath: resolved.fsPath };
  } catch {
    return null;
  }
}
