import * as path from 'path';

import * as vscode from 'vscode';

import { IndexEntry } from '../core/types';
import { IndexSnapshot } from '../core/resolver/resolveTarget';
import { isExcludedPath, buildExcludeGlob } from '../core/pathFilter';

const GLOB = '**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg}';

const DEFAULT_EXCLUDED_FOLDERS = [
  '.git',
  'node_modules',
  '.hg',
  '.svn',
  '.bzr',
  'bower_components',
];

// Soft cap on indexed files. Each entry is three short strings plus object/Map overhead —
// roughly 350-450 bytes — so the 50,000 default costs on the order of 20 MB of heap.
const DEFAULT_INDEX_MAX_FILES = 50000;

export class IndexService {
  private entries = new Map<string, IndexEntry>();
  private watcher?: vscode.FileSystemWatcher;
  private listeners: vscode.Disposable[] = [];

  async initialize(): Promise<void> {
    await this.scan();
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
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('wikiLinks.index.excludeFolders')) this.refresh();
      }),
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
    await this.scan();
  }

  dispose(): void {
    this.watcher?.dispose();
    for (const l of this.listeners) l.dispose();
  }

  private async scan(): Promise<void> {
    const exclude = buildExcludeGlob(excludedFolders());
    const cap = indexMaxFiles();
    const found = await vscode.workspace.findFiles(GLOB, exclude);
    for (const u of found.slice(0, cap)) this.add(u);
    if (found.length > cap) {
      vscode.window.showInformationMessage(
        `Wiki Links: this workspace has ${found.length} indexable files, above the ` +
          `${cap}-file limit. Only the first ${cap} are indexed, so some wiki-links may not ` +
          `resolve. Raise "wikiLinks.indexMaxFiles" to index more.`,
      );
    }
  }

  private add(u: vscode.Uri): void {
    const folder = vscode.workspace.getWorkspaceFolder(u);
    if (!folder) return;
    const rel = path.relative(folder.uri.fsPath, u.fsPath);
    // The FileSystemWatcher glob cannot carry an exclude, so filter vendor folders here too.
    if (isExcludedPath(rel, excludedFolders())) return;
    // Hard-stop at the cap so watcher-driven creates cannot grow the index past it.
    // Known paths are still allowed through so an in-place update (e.g. rename) is not blocked.
    if (!this.entries.has(u.fsPath) && this.entries.size >= indexMaxFiles()) return;
    const base = path.basename(u.fsPath).replace(/\.(md|markdown)$/i, '');
    this.entries.set(u.fsPath, { fsPath: u.fsPath, relPath: rel, baseNoExt: base });
  }
}

function indexMaxFiles(): number {
  const configured = vscode.workspace
    .getConfiguration('wikiLinks')
    .get<number>('indexMaxFiles', DEFAULT_INDEX_MAX_FILES);
  return typeof configured === 'number' && configured > 0 ? configured : DEFAULT_INDEX_MAX_FILES;
}

function excludedFolders(): string[] {
  const configured = vscode.workspace
    .getConfiguration('wikiLinks')
    .get<string[]>('index.excludeFolders');
  return Array.isArray(configured) ? configured : DEFAULT_EXCLUDED_FOLDERS;
}
