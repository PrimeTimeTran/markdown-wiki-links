import * as path from 'path';

import * as vscode from 'vscode';

import { rewriteWikiRefs } from '../core/rename/rewriteWikiRefs';
import { IndexSnapshot } from '../core/resolver/resolveTarget';
import { IndexEntry } from '../core/types';

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
      .filter((f) => /\.(md|markdown)$/i.test(f.oldUri.fsPath))
      .map((f) => ({ oldFsPath: f.oldUri.fsPath, newFsPath: f.newUri.fsPath }));
    if (renames.length === 0) return edit;

    // Build the snapshot from a fresh scan rather than the cached index: rename is rare,
    // correctness matters more than the cache, and the cache can lag fixture/file creation.
    const referrers = await vscode.workspace.findFiles('**/*.{md,markdown}', '**/node_modules/**');
    for (const ref of referrers) {
      const doc = await vscode.workspace.openTextDocument(ref);
      const text = doc.getText();
      const snap = buildSnapshot(ref, referrers);
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

function buildSnapshot(forUri: vscode.Uri, allMd: readonly vscode.Uri[]): IndexSnapshot {
  const folder = vscode.workspace.getWorkspaceFolder(forUri);
  const root = folder?.uri.fsPath ?? '';
  const entries: IndexEntry[] = allMd
    .filter((u) => u.fsPath.startsWith(root))
    .map((u) => ({
      fsPath: u.fsPath,
      relPath: path.relative(root, u.fsPath),
      baseNoExt: path.basename(u.fsPath).replace(/\.(md|markdown)$/i, ''),
    }));
  return { entries, workspaceRoot: root };
}
