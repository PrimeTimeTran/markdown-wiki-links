import * as vscode from 'vscode';
import { ScopeInfo } from './activityService';
import { Bookmark, BookmarkStore } from './bookmarkService';

export interface EstateContext {
  bookmark: string;
  uri: vscode.Uri;
  selection: vscode.Range;
  scope?: ScopeInfo;
}
export interface EstateFlag {
  id: string;
  label: string;
  description?: string;
  capabilities: any[];
  scope: 'language' | 'workspace';
  action: string;
}
export interface EstateScope {
  language: string;
  kind:
    | 'workspace'
    | 'module'
    | 'file'
    | 'struct'
    | 'enum'
    | 'trait'
    | 'impl'
    | 'function'
    | 'method'
    | 'block'
    | 'heading'
    | 'paragraph';
  name?: string;
  symbol?: string;
  range: vscode.Range;
  text: string;
  parent?: EstateScope;
}
export interface EstateFocus {
  id?: string;
  kind: 'bookmark' | 'symbol' | 'heading' | 'codeblock' | 'file' | 'unknown';
  range: vscode.Range;
  scope?: ScopeInfo;
  relations?: EstateRelation[];
}
export interface EstateRelation {
  type: 'owns' | 'owned-by' | 'influences' | 'derived-from' | 'related';

  target: string;
}
// # Primitives Planned
// Events that drive behavior
//  - Shortcut in editor
//  1. Swap sidebar from 'a' to 'b' panel with TTL. Enables quickly grabbing info
//  2. Swap sidebar indicator icon types. Right now it's static, always git with colors for new, dirty, deleted(in git view). This is similar to above view but more about shortcuts in my minds eye(for file explorer tree view anyway)
//  3. Enables us to 'back' or undo more than just editor and file. Imagine tree view file names has jump to 'previously' opened files via number instead of 'go back'. we often jump through files a bunch to identiy a root value and then want to jump back and forth between the stack more easily than remembering file names.
// - This could end up being "stack file view" is how I imagine it might work out, this is when we're using the cmd + click
export interface EstateEvent {
  type: 'cursor.changed' | 'file.opened' | 'panel.changed' | 'mode.changed' | 'shortcut.triggered';
  payload: unknown;
  timestamp: number;
}
export interface EventStoreType {
  emit(event: EstateEvent): void;
  on(type: EstateEvent['type'], handler: (event: EstateEvent) => void): vscode.Disposable;
}
export class EventStore implements EventStoreType {
  private handlers = new Map<string, Set<(event: EstateEvent) => void>>();
  emit(event: EstateEvent): void {
    const listeners = this.handlers.get(event.type);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }

  on(type: EstateEvent['type'], handler: (event: EstateEvent) => void): vscode.Disposable {
    let listeners = this.handlers.get(type);
    if (!listeners) {
      listeners = new Set();
      this.handlers.set(type, listeners);
    }
    listeners.add(handler);
    return {
      dispose: () => {
        listeners?.delete(handler);
      },
    };
  }
}

export async function showEstatePanel(bookmark: Bookmark) {
  const panel = vscode.window.createWebviewPanel(
    'estate',
    `🏠 ${bookmark.label}`,
    vscode.ViewColumn.Beside,
    {},
  );

  panel.webview.html = `
    <html>
      <body>
        <h1>${bookmark.label}</h1>

        <h3>Description</h3>
        <p>${bookmark.description ?? ''}</p>

        <h3>Context</h3>
        <p>${bookmark.context ?? ''}</p>

        <h3>Code</h3>
        <pre>${bookmark.code ?? ''}</pre>

        <h3>Body</h3>
        <p>${bookmark.body ?? ''}</p>
      </body>
    </html>
  `;
}

export class EstateTreeProvider implements vscode.TreeDataProvider<EstateNode> {
  constructor(private readonly store: BookmarkStore) {}

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    EstateNode | null | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  icons: any;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }
  refreshNode(node: EstateNode): void {
    this.onDidChangeTreeDataEmitter.fire(node);
  }
  getTreeItem(node: EstateNode): vscode.TreeItem {
    return node;
  }

  getChildren(node?: EstateNode): EstateNode[] {
    if (!node) {
      return [new EstateNode('Favorites'), new EstateNode('Flags')];
    }

    if (node.label === 'Favorites') {
      return this.store.list().map((id) => {
        const bookmark = this.store.get(id);

        return new EstateNode(bookmark?.label ?? id, undefined);
      });
    }

    return [];
  }
  //   getChildren(node?: EstateNode): EstateNode[] {
  //     if (!node) {
  //       return [new EstateNode('Files'), new EstateNode('Bookmarks')];
  //     }

  //     if (node.label === 'Files') {
  //       return [
  //         new EstateNode(
  //           'ownership.md',
  //           undefined,
  //           vscode.Uri.file(
  //             '/Users/future/KB/project/app/loi/crates/learn/design-decisions/pipeline/ownership.md',
  //           ),
  //         ),
  //       ];
  //     }

  //     return [];
  //   }
}

// export class EstateNode extends vscode.TreeItem {
//   constructor(
//     readonly label: string,
//     readonly collapsibleState = vscode.TreeItemCollapsibleState.Collapsed,
//   ) {
//     super(label, collapsibleState);

//     this.id = label;
//     this.tooltip = label;
//     this.contextValue = 'estate';
//   }
// }
export class EstateNode extends vscode.TreeItem {
  constructor(label: string, icon?: vscode.Uri) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = label;
    this.tooltip = label;
    this.contextValue = 'estate';
    if (icon) {
      this.iconPath = icon;
    }
  }
}
