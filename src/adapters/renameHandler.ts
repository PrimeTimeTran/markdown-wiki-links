import * as path from 'path';

import * as vscode from 'vscode';

import { rewriteWikiRefs } from '../core/rename/rewriteWikiRefs';
import { IndexSnapshot, buildLookup } from '../core/resolver/resolveTarget';
import { computeLineStarts, positionAt } from '../core/textPosition';
import { buildExcludeGlob } from '../core/pathFilter';
import { IndexEntry } from '../core/types';

import { excludedFolders } from './indexService';

// Files a wiki-link can target: Markdown documents plus embeddable media.
const LINKABLE_RE = /\.(md|markdown|png|jpe?g|gif|webp|svg)$/i;
// Files that can *contain* wiki-links — only these are scanned and rewritten.
const MARKDOWN_RE = /\.(md|markdown)$/i;
const INDEX_GLOB = '**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg}';

// The rename participant blocks VSCode's file operation until the edit is built (waitUntil),
// so this path must stay fast even in multi-thousand-file workspaces: referrers are read in
// parallel with vscode.workspace.fs (no TextDocument per file — opening one fires
// onDidOpenTextDocument and a diagnostics pass per referrer), and files that cannot possibly
// reference a renamed target are skipped by a cheap substring pre-filter.
const READ_CONCURRENCY = 16;

export class RenameHandler {
  register(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(
      vscode.workspace.onWillRenameFiles((e) => {
        // Workspace-trust gate: in untrusted workspaces, do not modify files on disk.
        if (!vscode.workspace.isTrusted) return;
        e.waitUntil(this.buildEdit(e.files));
      }),
    );
  }

  private async buildEdit(
    files: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>,
  ): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    const renames = files
      .filter((f) => LINKABLE_RE.test(f.oldUri.fsPath))
      .map((f) => ({ oldFsPath: f.oldUri.fsPath, newFsPath: f.newUri.fsPath }));
    if (renames.length === 0) return edit;

    // Build the snapshot from a fresh scan rather than the cached index: rename is rare,
    // correctness matters more than the cache, and the cache can lag fixture/file creation.
    // The scan must include media so embeds like ![[image.png]] resolve to the renamed file;
    // only Markdown files are scanned for occurrences to rewrite. The exclude list matches
    // the index, so vendor/VCS folders are neither scanned nor treated as link targets.
    const exclude = buildExcludeGlob(excludedFolders());
    const allFiles = await vscode.workspace.findFiles(INDEX_GLOB, exclude);
    const referrers = allFiles.filter((u) => MARKDOWN_RE.test(u.fsPath));
    // Referrers in the same workspace folder share one snapshot — build it once per root.
    const snapByRoot = new Map<string, IndexSnapshot>();
    const snapFor = (ref: vscode.Uri): IndexSnapshot => {
      const root = vscode.workspace.getWorkspaceFolder(ref)?.uri.fsPath ?? '';
      let snap = snapByRoot.get(root);
      if (!snap) {
        snap = buildSnapshot(root, allFiles);
        snapByRoot.set(root, snap);
      }
      return snap;
    };

    // Any wiki-ref form that resolves to a renamed file (bare, slashed, with or without
    // extension) contains its extensionless base name, so a referrer whose text lacks every
    // base name can be skipped without parsing. The renamed files themselves are exempt:
    // their same-file refs ([[#heading]]) match without naming the file.
    const needles = renames.map((r) =>
      path.basename(r.oldFsPath).replace(LINKABLE_RE, '').toLowerCase(),
    );
    const renamedFsPaths = new Set(renames.map((r) => r.oldFsPath));

    await forEachConcurrent(referrers, READ_CONCURRENCY, async (ref) => {
      // A doc already open (possibly dirty) must be read and positioned through its buffer.
      let doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === ref.toString());
      let text: string;
      if (doc) {
        text = doc.getText();
      } else {
        try {
          text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(ref));
          if (text.includes('�')) {
            // Replacement chars mean the bytes are not clean UTF-8 (UTF-16, legacy codepage).
            // Decoding wrong would skip or misplace rewrites, so take VSCode's encoding-aware
            // document load for this file only — the slow path stays off clean-UTF-8 files.
            doc = await vscode.workspace.openTextDocument(ref);
            text = doc.getText();
          }
        } catch {
          return; // deleted or unreadable between the scan and the read — nothing to rewrite
        }
      }
      if (!renamedFsPaths.has(ref.fsPath)) {
        const lower = text.toLowerCase();
        if (!needles.some((n) => lower.includes(n))) return;
      }
      const replacements = rewriteWikiRefs(text, ref.fsPath, renames, snapFor(ref));
      if (replacements.length === 0) return;
      const starts = doc ? undefined : computeLineStarts(text);
      const toPosition = (offset: number): vscode.Position => {
        if (doc) return doc.positionAt(offset);
        const p = positionAt(starts!, offset);
        return new vscode.Position(p.line, p.character);
      };
      for (const r of replacements) {
        edit.replace(ref, new vscode.Range(toPosition(r.start), toPosition(r.end)), r.newText);
      }
    });
    return edit;
  }
}

function buildSnapshot(root: string, allFiles: readonly vscode.Uri[]): IndexSnapshot {
  const entries: IndexEntry[] = allFiles
    .filter((u) => u.fsPath.startsWith(root))
    .map((u) => ({
      fsPath: u.fsPath,
      relPath: path.relative(root, u.fsPath),
      baseNoExt: path.basename(u.fsPath).replace(/\.(md|markdown)$/i, ''),
    }));
  return { entries, workspaceRoot: root, lookup: buildLookup(entries, root) };
}

async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}
