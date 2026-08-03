import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ScopeInfo } from './activity';
import { Anchor } from './adapters/bookmarkService';
import { AppStore } from './app';
import { CMD } from './cmds';
import { SECTIONS_LIST, SNIPPET_ITEMS } from './consts';

/* 
# Modes:
The modes we're in will help use idenitfy which panels to show/have

## Types
    - Dev:
        - Explorer
        - Outline
    - Debug
        - 
    - Doc
    - Cleanup
    - Explore
    - Learn
    Sorting logic needs to be planned well here.
    Similar to bookmarks of a browser, we want to collect 'easily' initiall and enable additional semantic meaning to be attached later
    - Blank
    - Series
    - Sequence
    - Connected
## Types 
*/
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
export type EstateFlags = EstateFlag[];
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
export interface EstateEvent {
  type: 'cursor.changed' | 'file.opened' | 'panel.changed' | 'mode.changed' | 'shortcut.triggered';
  payload: unknown;
  timestamp: number;
  // # Primitives Planned
  // Events that drive behavior
  //  - Shortcut in editor
  //  1. Swap sidebar from 'a' to 'b' panel with TTL. Enables quickly grabbing info
  //  2. Swap sidebar indicator icon types. Right now it's static, always git with colors for new, dirty, deleted(in git view). This is similar to above view but more about shortcuts in my minds eye(for file explorer tree view anyway)
  //  3. Enables us to 'back' or undo more than just editor and file. Imagine tree view file names has jump to 'previously' opened files via number instead of 'go back'. we often jump through files a bunch to identiy a root value and then want to jump back and forth between the stack more easily than remembering file names.
  // - This could end up being "stack file view" is how I imagine it might work out, this is when we're using the cmd + click
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
export class VFSProvider implements vscode.TextDocumentContentProvider {
  private documents = new Map<string, string>();
  set(uri: vscode.Uri, content: string) {
    this.documents.set(uri.toString(), content);
  }
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? '';
  }
  constructor(ctx: vscode.ExtensionContext, app: AppStore) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand('estate.snippet.save', () => {
        vscode.window.showInformationMessage('Saving snippet');
      }),
      vscode.commands.registerCommand('estate.snippet.preview', () => {
        vscode.window.showInformationMessage('Preview');
      }),

      vscode.commands.registerCommand('estate.snippet.export', () => {
        vscode.window.showInformationMessage('Export');
      }),
    );
    ctx.subscriptions.push(
      vscode.commands.registerCommand('estate.snippet-maker', async () => {
        const language = await this.pickSnippetLanguage();
        if (!language) {
          return;
        }
        // const doc = await vscode.workspace.openTextDocument({
        //   language: language.id,
        //   content: language.template,
        // });
        // const editor = await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('editor.action.formatDocument');
      }),
    );

    app.activity.subscribe((a) => {
      console.log('VFS Click');
    });
  }

  private async pickSnippetLanguage() {
    return vscode.window.showQuickPick(SNIPPET_ITEMS, {
      placeHolder: 'Choose snippet type',
    });
  }
  // When a bookmark has been tagged to be of a certain
  // class then we can attach capabilities.
  // Also useful if it's been idenfieid to have a matching property
}
export class VFSDecorator implements vscode.FileDecorationProvider {
  constructor(ctx: vscode.ExtensionContext, app: AppStore) {
    app.activity.subscribe((a) => {
      console.log('VFSDecorator click');
    });
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'estate') {
      return;
    }

    return {
      badge: '•',
      //   color: new vscode.ThemeColor('charts.green'),
      tooltip: 'Active bookmark',
    };
  }
  // 'charts.red'
  // 'charts.orange'
  // 'charts.yellow'
  // 'charts.green'
  // 'charts.blue'
  // 'charts.purple'

  // 'list.warningForeground'
  // 'list.errorForeground'
  // 'editorInfo.foreground'
  // 'terminal.ansiGreen'
}
export class EstateTreeProvider implements vscode.TreeDataProvider<EstateNode> {
  constructor(public app: AppStore) {}
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    EstateNode | null | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  icons: any;
  refresh(): void {
    console.log('[EstateTreeProvider].refresh');
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
      return SECTIONS_LIST.map((s) => new EstateNode('folder', s));
    }
    const bookmarks = this.app.bookmarks.list();
    switch (node.label) {
      case SECTIONS_LIST[0]:
        return bookmarks
          .filter((b) => !b.tags.includes('sequence') && !b.tags.includes('misc'))
          .map((b) => new EstateNode('bookmark', path.basename(b.uri() ?? '') ?? '', b));

      case SECTIONS_LIST[1]:
        return bookmarks
          .filter((b) => b.tags.includes('sequence'))
          .map((b) => new EstateNode('bookmark', path.basename(b.uri() ?? '') ?? '', b));

      case SECTIONS_LIST[2]:
        return bookmarks
          .filter((b) => b.tags.includes('misc'))
          .map((b) => new EstateNode('bookmark', path.basename(b.uri() ?? '') ?? '', b));

      default:
        return [];
    }
  }
  async ensureEditorOpen() {
    const editors = vscode.window.visibleTextEditors;
    if (editors.length > 0) {
      return;
    }
    const uri = path.join(os.homedir(), '.estate', 'hello.html');
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Active,
      preview: false,
    });
  }
}
export class EstateNode extends vscode.TreeItem {
  constructor(
    public readonly type: 'folder' | 'bookmark',
    public readonly label: string,
    public readonly bookmark?: Anchor,
  ) {
    super(
      label,
      type === 'folder'
        ? label === 'main'
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = bookmark?.id ?? label;
    this.contextValue = type;

    if (type === 'bookmark') {
      this.contextValue = 'bookmark';
    } else {
      this.contextValue = 'folder';
    }

    if (bookmark) {
      //   sections.includes(capitalizeFirstLetter(label));
      this.resourceUri = vscode.Uri.parse(`estate://${bookmark.id}`);
      this.applyAnchorStyle(bookmark);
    }
    // this.applyCommand(bookmark);
    // this.command = {
    //   command: CMD.bookmark.open,
    //   title: 'Open Anchor',
    //   arguments: [bookmark],
    // };

    if (SECTIONS_LIST.includes(this.label)) {
      vscode.window.showInformationMessage('clicked title');
    } else {
      this.command = {
        command: CMD.bookmark.open,
        title: 'Open Anchor',
        arguments: [bookmark],
      };
    }
  }
  private applyCommand(bookmark: Anchor) {
    // switch (bookmark.label) {
    //   case 'Main':
    //     this.command = {
    //       command: CMD.bookmark.open,
    //       title: 'Open Anchor',
    //       arguments: [bookmark],
    //     };
    //     break;
    //   // return bookmarks
    //   //   .filter((b) => !b.tags.includes('sequence') && !b.tags.includes('misc'))
    //   //   .map((b) => new EstateNode('bookmark', b.label ?? '', b));
    // }
  }
  private applyAnchorStyle(bookmark: Anchor) {
    const uri = bookmark?.uri?.() || '';
    const isSettingsFile = /settings\.json$/i.test(uri);
    const tags = bookmark.tags ?? [];
    this.iconPath = new vscode.ThemeIcon('pinned', new vscode.ThemeColor('charts.red'));

    if (isSettingsFile) {
      this.iconPath = new vscode.ThemeIcon('settings-gear');
    } else if (tags.includes('index')) {
      // https://microsoft.github.io/vscode-codicons/dist/codicon.html?utm_source=chatgpt.com
      this.iconPath = new vscode.ThemeIcon('list-unordered');
    } else if (tags.includes('tools')) {
      this.iconPath = new vscode.ThemeIcon('tools');
    }
    if (tags.includes('todo')) {
      this.iconPath = new vscode.ThemeIcon('checklist');
    }
    if (tags.includes('important')) {
      this.iconPath = new vscode.ThemeIcon('star-full');
    }
    this.description = this.getDescription(tags);
    this.contextValue = tags.join('.');
    // 'bookmark'          // bookmarks
    // 'star-full'         // favorites
    // 'flag'              // flags
    // 'lightbulb'         // ideas
    // 'warning'           // issues
    // 'bug'               // bugs
    // 'checklist'         // tasks
    // 'symbol-structure'  // architecture
    // 'symbol-class'      // types
    // 'symbol-method'     // functions
    // 'file-code'         // code
    // 'library'           // knowledge
    // 'archive'           // saved artifacts
    // 'graph'             // relationships
    // 'link'              // references
    // Inside your TreeItem constructor or method:
  }
  private getDescription(tags: string[]) {
    return tags.join(' · ');
  }
}

function capitalizeFirstLetter(str: string) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
