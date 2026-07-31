import * as fs from 'fs';
import * as fsPromise from 'node:fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Bookmark, BookmarkSeries, BookmarkStore } from './adapters/bookmarkService';

export interface Presenter<T> {
  present(value: T): Thenable<void>;

  // Notification
  info(message: string): Thenable<void>;
  warning(message: string): Thenable<void>;
  error(message: string): Thenable<void>;

  // Pickers
  quickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;

  multiPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ): Thenable<T[] | undefined>;

  input(options?: vscode.InputBoxOptions): Thenable<string | undefined>;

  // Editors
  configure(bookmark: T): Thenable<void>;
  open(bookmark: T): Thenable<void>;
  openDiff(left: vscode.Uri, right: vscode.Uri): Thenable<void>;

  // Panels
  showEditor(bookmark: T): Thenable<void>;
  showSeries(series: BookmarkSeries): Thenable<void>;

  // Tree / Explorer
  reveal(id: string): Thenable<void>;
  refresh(): void;

  // Navigation
  openLocation(location: vscode.Location): Thenable<void>;
}

// export class BookmarkEditorPresenter implements Presenter<Bookmark> {}
// export class SeriesPresenter implements Presenter<BookmarkSeries> {
//   async present(series: BookmarkSeries) {}
// }
// export class SemanticGraph {}
// export class GraphPresenter implements Presenter<SemanticGraph> {
//   async present(graph: SemanticGraph) {}
// }
