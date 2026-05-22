import * as path from 'path';

import * as vscode from 'vscode';

import { rewriteWikiRefs } from '../core/rename/rewriteWikiRefs';
import { IndexSnapshot } from '../core/resolver/resolveTarget';
import { IndexEntry } from '../core/types';

// Files a wiki-link can target: Markdown documents plus embeddable media.
const LINKABLE_RE = /\.(md|markdown|png|jpe?g|gif|webp|svg)$/i;
// Files that can *contain* wiki-links — only these are scanned and rewritten.
const MARKDOWN_RE = /\.(md|markdown)$/i;
const INDEX_GLOB = '**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg}';

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
    // only Markdown files are scanned for occurrences to rewrite.
    const allFiles = await vscode.workspace.findFiles(INDEX_GLOB, '**/node_modules/**');
    const referrers = allFiles.filter((u) => MARKDOWN_RE.test(u.fsPath));
    // Referrers in the same workspace folder share one snapshot — build it once per root.
    const snapByRoot = new Map<string, IndexSnapshot>();
    for (const ref of referrers) {
      const root = vscode.workspace.getWorkspaceFolder(ref)?.uri.fsPath ?? '';
      let snap = snapByRoot.get(root);
      if (!snap) {
        snap = buildSnapshot(root, allFiles);
        snapByRoot.set(root, snap);
      }
      const doc = await vscode.workspace.openTextDocument(ref);
      const text = doc.getText();
      const replacements = rewriteWikiRefs(text, ref.fsPath, renames, snap);
      for (const r of replacements) {
        edit.replace(
          ref,
          new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)),
          r.newText,
        );
      }
    }
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
  return { entries, workspaceRoot: root };
}
