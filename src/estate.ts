import { randomUUID } from "crypto";
import * as path from "path";

import * as vscode from "vscode";

import { CMD } from "../generated/cmd";
import { ScopeInfo } from "./activity";
import { Anchor } from "./anchor";
import { AppStore } from "./app";
import { SECTIONS_LIST, SNIPPET_ITEMS } from "./consts";

// https://code.visualstudio.com/api/references/icons-in-labels#animation
// https://microsoft.github.io/vscode-codicons/dist/codicon.html?utm_source=chatgpt.com
// https://github.com/alefragnani/vscode-bookmarks/blob/master/src/sidebar/bookmarkNode.ts

export interface EstateContext {
  anchor: string;
  uri: vscode.Uri;
  selection: vscode.Range;
  scope?: ScopeInfo;
}
export interface EstateFlag {
  id: string;
  label: string;
  description?: string;
  capabilities: any[];
  scope: "language" | "workspace";
  action: string;
}
export type EstateFlags = EstateFlag[];
export interface EstateScope {
  language: string;
  kind:
    | "workspace"
    | "module"
    | "file"
    | "struct"
    | "enum"
    | "trait"
    | "impl"
    | "function"
    | "method"
    | "block"
    | "heading"
    | "paragraph";
  name?: string;
  symbol?: string;
  range: vscode.Range;
  text: string;
  parent?: EstateScope;
}
export interface EstateFocus {
  id?: string;
  kind: "anchor" | "symbol" | "heading" | "codeblock" | "file" | "unknown";
  range: vscode.Range;
  scope?: ScopeInfo;
  relations?: EstateRelation[];
}
export interface EstateRelation {
  type: "owns" | "owned-by" | "influences" | "derived-from" | "related";

  target: string;
}
export interface EstateEvent {
  type: "cursor.changed" | "file.opened" | "panel.changed" | "mode.changed" | "shortcut.triggered";
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
  on(type: EstateEvent["type"], handler: (event: EstateEvent) => void): vscode.Disposable;
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
  on(type: EstateEvent["type"], handler: (event: EstateEvent) => void): vscode.Disposable {
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
    return this.documents.get(uri.toString()) ?? "";
  }
  constructor(ctx: vscode.ExtensionContext, app: AppStore) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(CMD.estate.snippet.create, async () => {
        const language = await this.pickSnippetLanguage();
        if (!language) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument({
          language: language.id,
          content: language.template,
        });
        const _editor = await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand("editor.action.formatDocument");
      }),
      vscode.commands.registerCommand(CMD.estate.snippet.read, () => {
        vscode.window.showInformationMessage("Reading snippet");
      }),
      vscode.commands.registerCommand(CMD.estate.snippet.update, () => {
        vscode.window.showInformationMessage("Saving snippet");
      }),
      vscode.commands.registerCommand(CMD.estate.snippet.delete, () => {
        vscode.window.showInformationMessage("Deleting snippet");
      }),
      vscode.commands.registerCommand("estate.snippet.export", () => {
        vscode.window.showInformationMessage("Export");
      }),
    );
    app.activity.subscribe((_a) => {
      console.log("[-- 3 -- VFSProvider.windowClick()]");
    });
  }

  private async pickSnippetLanguage() {
    return vscode.window.showQuickPick(SNIPPET_ITEMS, {
      placeHolder: "Choose snippet type",
    });
  }
  // When a anchor has been tagged to be of a certain
  // class then we can attach capabilities.
  // Also useful if it's been idenfieid to have a matching property
}

export class VFSDecorator implements vscode.FileDecorationProvider {
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();

  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  constructor(ctx: vscode.ExtensionContext, app: AppStore) {
    app.activity.subscribe((_a) => {
      console.log("[-- 4 -- VFSDecorator.windowClick()]");
      this._onDidChangeFileDecorations.fire();
    });
  }

  // Decorates Tree & Editor
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    console.log("[-- 9 -- VFSDecorator.windowClick().provideFileDecoration()]");
    if (uri.scheme !== "estate") {
      return;
    }
    return {
      badge: "•",
      color: new vscode.ThemeColor("charts.green"),
      tooltip: "Active anchor",
    };
  }
}
export class EstateProvider implements vscode.TreeDataProvider<EstateNode> {
  icons: any;
  treeView: vscode.TreeView<EstateNode>;
  constructor(public app: AppStore) {
    this.treeView = vscode.window.createTreeView("estateExplorer", {
      treeDataProvider: this,
    });
    app.ctx.subscriptions.push(
      this.onDidChangeTreeData(async (_e) => {
        console.log("[EstateProvider].onDidChangeTreeData");
        // if (e.visible) {
        //   //   await this.tree.ensureEditorOpen();
        // }
      }),
    );
    return this;
  }
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    EstateNode | null | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  refresh(): void {
    console.log("[EstateProvider].refresh");
    this.onDidChangeTreeDataEmitter.fire();
  }
  getTreeItem(node: EstateNode): any {
    return node;
  }
  getChildren(node?: EstateNode): EstateNode[] {
    if (!node) {
      // Warning:
      // SECTIONS_LIST.map(this.buildStage)
      // Looks simpler but doesn't bind "this" so creates errors.
      return SECTIONS_LIST.map((section) => this.buildStage(section));
    }

    if (node.isStageNode) {
      return this.buildSection(node.label, node);
    }

    return this.buildChildren(node);
  }
  getParent(node: EstateNode) {
    if (node.parent?.isStageNode) return null;
    return node.parent;
  }
  buildStage(section: string) {
    let label = this.buildLabel(section);
    return new EstateNode(true, label, undefined, undefined);
  }
  buildNode(node: EstateNode, a: Anchor) {
    let name = path.basename(a.uri() ?? "");
    let label = this.buildLabel(name);
    return new EstateNode(false, label, a, node);
  }
  buildLabel(name: string): vscode.TreeItemLabel {
    return {
      label: name,
      // highlights: [
      //   [0, 2],
      //   [3, 8],
      // ],
    };
  }
  buildSection(section: vscode.TreeItemLabel, node: EstateNode) {
    let anchors = this.app.anchors.list().filter((a) => !a.tags.includes("AnchorTags.SoftDeleted"));
    return anchors
      .filter((b) => section.label == "draft" || b.tags.includes(section.label))
      .map((a) => this.buildNode(node, a));
  }
  buildChildren(node: EstateNode) {
    // console.log("parent", node.anchor?.id);
    // console.log("anchor ids", node.anchor?.anchors);
    const resolved = (node.anchor?.anchors ?? []).map((id) => {
      const a = this.app.anchors.get(id);
      // console.log(id, "->", a);
      return a;
    });

    return resolved.filter((a): a is Anchor => !!a).map((a) => this.buildNode(node, a));
  }

  async ensureEditorOpen() {
    // const editors = vscode.window.visibleTextEditors;
    // if (editors.length > 0) {
    //   return;
    // }
    // const file = PATHS.asset('hello.html');
    // console.log('OPENING:', file);
    // const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  }
}
export class EstateNode extends vscode.TreeItem {
  constructor(
    public isStageNode: boolean,
    public readonly label: vscode.TreeItemLabel,
    public readonly anchor?: Anchor,
    public readonly parent?: EstateNode,
    public tooltip?: string,
  ) {
    const hasChildren = isStageNode || (anchor?.anchors?.length ?? 0) > 0;
    super(
      label,
      hasChildren ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    this.id = isStageNode ? label.label : randomUUID();
    if (anchor) {
      this.contextValue = "anchor";
      const uri = anchor?.src?.uri;
      if (uri) {
        this.resourceUri = vscode.Uri.file(uri);
      } else {
        this.iconPath = new vscode.ThemeIcon("pinned", new vscode.ThemeColor("charts.red"));
      }
      this.applyAnchorStyle(anchor);
    } else {
      this.contextValue = "folder";
    }
    if (isStageNode) {
      this.iconPath = new vscode.ThemeIcon("pinned", new vscode.ThemeColor("charts.red"));
    }
    // We're going to have lots of options her eon how to sort based on the node clicked
    // How to display the tree, sort, filter, etc.
    this.command = {
      command: CMD.estate.bookmark.read,
      title: "Open Anchor",
      arguments: [this.id, this, anchor],
    };
  }
  get hasChildren() {
    return (this.anchor?.anchors?.length ?? 0) > 0;
  }
  getParent(element: EstateNode): vscode.ProviderResult<EstateNode> {
    return element.parent;
  }
  private applyCommand(_anchor: Anchor) {
    // switch (anchor.label) {
    //   case 'Main':
    //     this.command = {
    //       command: CMD.anchor.open,
    //       title: 'Open Anchor',
    //       arguments: [anchor],
    //     };
    //     break;
    //   // return anchors
    //   //   .filter((b) => !b.tags.includes('sequence') && !b.tags.includes('misc'))
    //   //   .map((b) => new EstateNode('anchor', b.label ?? '', b));
    // }
  }
  private applyAnchorStyle(anchor: Anchor) {
    const tags = anchor.tags ?? [];

    if (tags.includes("todo")) {
      this.iconPath = new vscode.ThemeIcon("checklist");
    } else if (tags.includes("important")) {
      this.iconPath = new vscode.ThemeIcon("star-full", new vscode.ThemeColor("charts.red"));
    } else {
      this.iconPath = undefined;
    }

    this.description = tags.join(" · ");
    this.contextValue = tags.join(".");
  }
  public getDescription(tags: string[]) {
    return tags.join(" · ");
  }
}

function _capitalizeFirstLetter(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
