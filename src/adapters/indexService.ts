import * as path from 'path';

import * as vscode from 'vscode';

import { IndexEntry } from '../core/types';
import { IndexSnapshot } from '../core/resolver/resolveTarget';

const GLOB = '**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg}';

export class IndexService {
  private entries = new Map<string, IndexEntry>();
  private watcher?: vscode.FileSystemWatcher;
  private listeners: vscode.Disposable[] = [];

  async initialize(): Promise<void> {
    const found = await vscode.workspace.findFiles(GLOB, '**/node_modules/**');
    for (const u of found) this.add(u);
    this.watcher = vscode.workspace.createFileSystemWatcher(GLOB);
    this.listeners.push(
      this.watcher.onDidCreate((u) => this.add(u)),
      this.watcher.onDidDelete((u) => this.entries.delete(u.fsPath)),
      vscode.workspace.onDidRenameFiles((e) => {
        for (const f of e.files) {
          this.entries.delete(f.oldUri.fsPath);
          this.add(f.newUri);
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
    );
  }

  snapshotFor(fromFsPath: string): IndexSnapshot {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fromFsPath));
    const root = folder?.uri.fsPath ?? '';
    return {
      entries: [...this.entries.values()].filter((e) => e.fsPath.startsWith(root)),
      workspaceRoot: root,
    };
  }

  async refresh(): Promise<void> {
    this.entries.clear();
    const found = await vscode.workspace.findFiles(GLOB, '**/node_modules/**');
    for (const u of found) this.add(u);
  }

  dispose(): void {
    this.watcher?.dispose();
    for (const l of this.listeners) l.dispose();
  }

  private add(u: vscode.Uri): void {
    const folder = vscode.workspace.getWorkspaceFolder(u);
    if (!folder) return;
    const rel = path.relative(folder.uri.fsPath, u.fsPath);
    const base = path.basename(u.fsPath).replace(/\.(md|markdown)$/i, '');
    this.entries.set(u.fsPath, { fsPath: u.fsPath, relPath: rel, baseNoExt: base });
  }
}
