import * as fs from "fs";
import { randomUUID } from "node:crypto";
import * as fsPromise from "node:fs/promises";
import * as os from "os";
import * as path from "path";

import * as vscode from "vscode";

import { CMD } from "../generated/cmd";
import { AnchorActivity, AppActivity } from "./activity";
import { anchorShowPage, getHtml } from "./adapters/htmlAnchor";
import { AppStore } from "./app";
import { cfg, PATHS } from "./cfg";
import { capability, flags } from "./cmd/flags";
import { EstateContext, EstateFlag, EstateNode } from "./estate";
import {
  AnchorRef,
  AnchorSource,
  AnchorOrigin,
  AnchorLocation,
  AnchorStoreType,
  CreateAnchorOptions,
} from "./types";
// # Flag
// - Fold flags: show prevent 'above' from 'unfolding' no matter how many depths I've unfolded. Think about how I might want to 'ignore' tests of rust or imports or 'first impl'
// # Anchor capabilities
// seed: a anchor which is saved to disk with no other capabilities attached
//  - personal
//  - 'web anchor' for code blocks
// overlay: a 'local' anchor which is injected into a 'public' repo/file/commit. Creates a copy of itself into the .estate of that repo
// clone: a synced 'anchor' that auto follows counter party source
//  - think of it as
// fork: a anchor that creates a copy of the original but with the intention of not remaining the same and done explicitly to see that 'this is the reason why we did this'.
//  - consider adding it as a 'prev' version with 'x y z' reasons we did this or that.
// series: enables progression ui 'move through'.
//  - 1. lexer, 2. parser, 3, type checking
// option: enables picking one of more
//  - graph problems: dfs, bfs, etc.
// interface augments types

// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
export interface Anchor {
  // Identity
  id: string;
  label?: string;

  // Existing anchor fields
  type?: string;
  description?: string;

  code?: string;
  context?: string;
  body?: string;

  scratchpadBody?: string;
  scratchpadExt?: string;

  repo?: string;
  commit?: string;

  scope?: string;
  privacy?: string;

  updatedAt?: string;
  createdAt?: string;

  // Existing anchor relationship
  // references to other anchors
  anchors: string[];

  // New: where this anchor came from
  origin: AnchorOrigin;

  // New: source/code locations
  locations?: AnchorLocation[];

  // New: organization
  // Later this can become a proper relationship table/store
  lists?: string[];
}
export class Anchor implements Anchor {
  id: string;
  label?: string;
  src?: AnchorSource;
  tags: string[] = [];
  capabilities: EstateFlag[] = [];
  constructor(id: string, data: Partial<Anchor>) {
    this.id = id;
    Object.assign(this, data);
  }
  uri(): string {
    if (!this.src?.uri) {
      throw new Error("Invalid URI");
    }
    return this.src.uri.toString();
  }
  get startLine(): number {
    return this.src?.startLine ?? 0;
  }
}
// - Rename
// - Link
// - Pipeline
export class AnchorStore implements AnchorStoreType {
  private items = new Map<string, Anchor>();
  private fileIndex = new Map<string, Anchor[]>();
  // 1. Add to items and fileIndex when creating
  // 2. Use fileIndex for embedded(or over all, so we dont have to do "row by row scan")
  private flags = new Map<string, EstateFlag>();
  private registryPath = PATHS.anchors();
  public roots: any[] = [];
  private anchorDecoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file("/path/to/anchor.svg"),
    overviewRulerColor: "#888888",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: "Hi there! 🔖",
    },
  });
  private decorateAnchors(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.fsPath;
    const ranges: vscode.Range[] = [];
    for (const anchor of this.list()) {
      if (!anchor?.src) {
        continue;
      }
      if (anchor.src.uri !== uri) {
        continue;
      }
      ranges.push(
        new vscode.Range(
          anchor.src.startLine,
          anchor.src.startCharacter ?? 0,
          anchor.src.endLine,
          anchor.src.endCharacter ?? 0,
        ),
      );
    }
    editor.setDecorations(this.anchorDecoration, ranges);
  }
  constructor(public app: AppStore) {
    console.log("[AnchorStore.constructor].start");
    this.anchorDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        margin: "0 0 0 1rem",
        color: new vscode.ThemeColor("descriptionForeground"),
        fontStyle: "italic",
      },
    });
    const estates = this.findEstates();
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, cfg.registryName));
    }
    this.initIntrinsic();
    this.initializeRegistry();
    vscode.commands.registerCommand(CMD.estate.bookmark.delete, (ctx) => {
      // Works like this.
      // vscode.window.showWarningMessage(`Delete id: ${Object.keys(ctx)}, Anchor ${ctx?.anchor?.id}`);
      if (!ctx) return;
      this.deleteAnchor(ctx.anchor);
    });

    // ⚠️ Careful!
    // - Pass app, ctx, or a 3rd argument to have it later. Otherwise the properties of this will be lost
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(CMD.estate.bookmark.create, this.addAnchor, this),
      vscode.commands.registerCommand(
        CMD.estate.bookmark.update,
        (node: EstateNode) => {
          // Safely extract the anchor from your node without stringifying the whole circular tree node
          const anchor = node.anchor; // Adjust property name based on your EstateNode implementation

          if (!anchor) {
            vscode.window.showErrorMessage("No anchor found on this node.");
            return;
          }

          console.log("[AnchorStorage.update] anchor id:", anchor.id);

          // Call your webview pane opener instead of just doing a background update,
          // since this is an "Edit bookmark" action!
          this.app.presenter.showAnchorPane(anchor);
        },
        this,
      ),
    );
    app.activity.subscribe(() => {
      //   console.log('Anchor store... activity detcted');
      //   this.decorateAnchors();
    });
  }
  initializeRegistry(): void {
    const estate = this.resolveRegistry();
    if (!estate) return;
    const registry = path.join(estate, "registry", PATHS.anchors());
    if (!fs.existsSync(registry)) {
      return;
    }
    const json = JSON.parse(fs.readFileSync(registry, "utf8"));
    for (const [id, anchor] of Object.entries(json.items ?? {})) {
      this.items.set(id, anchor as Anchor);
    }
  }
  public loadRegistry(file: string): void {
    if (!fs.existsSync(file)) return;
    const raw = fs.readFileSync(file, "utf8");
    const json = JSON.parse(raw);
    const items = json.items ?? {};
    for (const [id, anchor] of Object.entries(items as Record<string, Partial<Anchor>>)) {
      const b = new Anchor(id, anchor);
      this.register(id, b);
    }
  }
  loadFsPath(filePath: string): void {
    const estates = this.findEstatesFs(filePath);
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, "anchors.json"));
    }
  }
  private initIntrinsic(): EstateFlag[] {
    for (const f of flags) {
      this.registerFlag(f);
    }
    for (const c of capability) {
      this.registerFlag(c);
    }
    return flags;
  }
  private findEstates(): string[] {
    const estates: string[] = [];
    const homeEstate = path.join(os.homedir(), cfg.estateDirName);
    if (fs.existsSync(homeEstate)) {
      estates.push(homeEstate);
    }
    return estates;
  }
  private findEstatesFs(filePath: string): string[] {
    const estates: string[] = [];
    let current = path.dirname(filePath);
    while (true) {
      const candidate = path.join(current, cfg.estateDirName);
      if (fs.existsSync(candidate)) {
        estates.push(candidate);
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return estates.reverse();
  }
  findAnchors(text: string, store: AnchorStore, line: number): AnchorRef[] {
    return this.findAnchorsLocations(text, line)
      .filter((t) => store.has(t.id))
      .map((t) => ({ ...t }));
  }
  findFlags(text: string, store: AnchorStore, line: number): AnchorRef[] {
    return this.findAnchorsLocations(text, line).flatMap((t) => {
      const flag = store.getFlag(t.id);
      return flag ? [{ ...t, flag }] : [];
    });
  }
  findAnchorsLocations(text: string, line: number): AnchorRef[] {
    const results: AnchorRef[] = [];
    const regex = /@[A-Za-z0-9_-]+/g;
    for (const match of text.matchAll(regex)) {
      results.push({
        id: match[0],
        line,
        start: match.index!,
        end: match.index! + match[0].length,
      });
    }
    return results;
  }
  findByUri(uri: vscode.Uri): Anchor[] {
    const target = uri.toString();
    return this.list().filter((anchor: Anchor) =>
      anchor.locations?.some((location: AnchorLocation) => location.uri === target),
    );
  }
  find(file: vscode.Uri, text: string, line: number): AnchorRef[] {
    const results = [...this.findAnchors(text, this, line), ...this.findFlags(text, this, line)];
    for (const anchor of this.findSortedIndex(file, line)) {
      results.push({
        id: anchor.id,
        line,
        start: anchor.src!.startCharacter ?? 0,
        end: anchor.src!.endCharacter ?? 0,
      });
    }
    return results;
  }
  findInFile(file: vscode.Uri): Anchor[] {
    let items = this.list().filter((a) => this.inFile(a, file));
    // console.log("[AnchorStore].findInFile", file);
    // console.log("[AnchorStore].findInFile", items);
    return items;
  }
  findSortedIndex(file: vscode.Uri, line: number): Anchor[] {
    return this.findInIndex(file).filter(
      (b) => b.src && line >= b.src.startLine && line <= b.src.endLine,
    );
  }
  findInIndex(file: vscode.Uri): Anchor[] {
    return this.fileIndex.get(file.toString()) ?? [];
  }
  public async saveAnchor(patch: Partial<Anchor>) {
    // if (!this.currentAnchor) {
    //   return;
    // }
    // this.app.anchors.update(this.currentAnchor.id, patch);
    // this.app.anchors.save();
  }
  create(
    id: string,
    ctx: EstateContext,
    opts: CreateAnchorOptions,
    anchor: Partial<Anchor>,
  ): Anchor {
    const now = new Date().toISOString();
    let b = new Anchor(id, {
      id,
      tags: [],
      type: anchor.type ?? "concept",
      label: opts.label,
      description: anchor.description ?? "",
      privacy: opts.privacy ?? "personal",
      body: anchor.body ?? "",
      context: anchor.context ?? "",
      code: anchor.code ?? "",
      repo: anchor.repo ?? "",
      commit: anchor.commit ?? "",
      scope: anchor.scope ?? "unknown",
      src: anchor.src,
      anchors: [],
      origin: "personal",
      createdAt: now,
      updatedAt: now,
      scratchpadBody: "",
      scratchpadExt: "",
    });
    this.register(id, b);
    return b;
  }
  async addAnchor(ctx: vscode.ExtensionContext, app: AppStore) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const selection = editor.selection;
    // if (selection.isEmpty) {
    //   // It is useful to save files with no content
    //   vscode.window.showWarningMessage('Select something to anchor first');
    //   return;
    // }
    const document = editor.document;
    const selectedText = document.getText(selection);
    let id = randomUUID();
    let name = path.basename(document.uri.toString() ?? "");
    this.create(
      id,
      {
        anchor: id,
        uri: document.uri,
        selection,
      },
      {
        label: `⚓️ ${name} ${id}`,
        description: "Captured source block",
        privacy: "workspace",
      },
      {
        type: "code",
        body: selectedText,
        scope: "source.selection",
        src: {
          uri: document.uri.fsPath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          startCharacter: selection.start.character,
          endCharacter: selection.end.character,
          languageId: document.languageId,
        },
      },
    );
    // await editor.edit((edit) => {
    //   edit.insert(
    //     new vscode.Position(selection.start.line, 0),
    //     `// ${id} linked estate anchor\n`,
    //   );
    // });
    await this.save();
  }
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  // delete(id: string) {
  //   this.items.delete(id);
  //   this.save();

  //   this._onDidChange.fire();
  // }
  // async deleteAnchor(node: EstateNode, anchor: Anchor) {
  //   const id = node?.id || anchor.id;
  //   vscode.window.showInformationMessage(`Deleted anchor ${id}`);

  //   if (!this.items.has(id)) {
  //     vscode.window.showWarningMessage(`Anchor not found: ${id}`);
  //     return;
  //   }
  //   this.items.delete(id);
  //   for (const [file, anchors] of this.fileIndex.entries()) {
  //     const filtered = anchors.filter((a) => a.id !== id);

  //     if (filtered.length === 0) {
  //       this.fileIndex.delete(file);
  //     } else {
  //       this.fileIndex.set(file, filtered);
  //     }
  //   }
  //   await this.save();
  //   // optional but useful: guarantee consistency
  //   // await this.reset();

  //   this.app.tree.refresh();
  //   this._onDidChange.fire();
  // }
  async deleteAnchor(anchor: Anchor) {
    const id = anchor.id;
    const item = this.items.get(id);
    vscode.window.showWarningMessage(`Deleted ${id}`);
    if (!item) return;
    if (!item.tags.includes("AnchorTags.SoftDeleted")) {
      item.tags.push("AnchorTags.SoftDeleted");
    }
    this.items.set(id, item);
    await this.save();
    this.app.tree.refresh();
    this._onDidChange.fire();
  }
  register(id: string, anchor: Anchor) {
    if (anchor.tags?.includes("AnchorTags.SoftDeleted")) {
      return;
    }
    try {
      this.items.set(id, anchor);
      const key = anchor.uri().toString();
      const list = this.fileIndex.get(key) ?? [];
      list.push(anchor);
      list.sort((a, b) => a.startLine - b.startLine);
      // File anchors first.
      // list.sort((a, b) => (a.src?.startLine ?? 0) - (b.src?.startLine ?? 0));
      // If you want "whole-file anchors" to sort after line-based anchors, use something large:
      // list.sort((a, b) => (a.src?.startLine ?? Infinity) - (b.src?.startLine ?? Infinity));
      this.fileIndex.set(key, list);
      vscode.window.showInformationMessage(`Before Save ${list.length}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Error saving. ${error}`);
    }
  }
  async save(): Promise<void> {
    const data = {
      items: Object.fromEntries(this.items),
    };
    await fsPromise.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fsPromise.writeFile(this.registryPath, JSON.stringify(data, null, 2), "utf8");
    vscode.window.showInformationMessage(`After Save ${data.items.size}`);
  }
  get(id: string) {
    // console.log("lookup:", id);
    // console.log("keys:", [...this.items.keys()]);
    return this.items.get(id);
  }
  has(id: string) {
    return this.items.has(id);
  }
  hasSource(id: string) {
    return this.items.has(id);
  }
  getFlag(id: string): EstateFlag | undefined {
    return this.flags.get(id);
  }
  hasFlag(id: string) {
    return this.flags.has(id);
  }
  getUri(a: Anchor): vscode.Uri {
    if (!a?.src?.uri) {
      throw Error("Invalid Uri");
    }
    return vscode.Uri.file(a.src.uri);
  }
  ids() {
    return [...this.items.keys()];
  }
  list(): Anchor[] {
    return [...this.items.values()].filter((a) => !a.tags.includes("AnchorTags.SoftDeleted"));
  }
  inFile(a: Anchor, _file: vscode.Uri) {
    let result = this.getUri(a);
    // let result = this.getUri(a).fsPath == file.fsPath;
    // console.log("[AnchorStore].inFile", file.fsPath);
    // console.log("[AnchorStore].inFile", a.src?.uri);
    // console.log("[AnchorStore].inFile", resultLa);
    // console.log("[AnchorStore].inFile", result.fsPath);
    return result;
  }
  async update(
    anchor: Anchor,
    // opts: CreateAnchorOptions,
  ) {
    await this.app?.presenter?.showAnchorPane(anchor);
  }
  delete(id: string) {
    throw new Error("TODO");
  }
  // Globals available as u type
  registerFlag(flag: EstateFlag): void {
    this.flags.set(flag.id, flag);
  }
  getRange(b: Anchor) {
    try {
      let { src } = b;
      if (!src) throw Error("Invalid Anchor");
      return new vscode.Range(
        src.startLine,
        src.startCharacter ?? 0,
        src.endLine,
        src.endCharacter ?? 0,
      );
    } catch (error) {
      console.log("Get Range Error: ", error);
    }
  }
  private registerFlagsUser(filePath: string): EstateFlag[] {
    const flags: EstateFlag[] = [
      {
        id: "1",
        label: "save",
        description: "hi",
        scope: "language",
        action: "wiki.click",
        capabilities: [],
      },
    ];
    return flags;
  }
  private resolveRegistry(): string | undefined {
    for (const root of this.roots) {
      let current = root;
      while (current !== path.dirname(current)) {
        const candidate = path.join(current, cfg.estateDirName);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        current = path.dirname(current);
      }
    }
    return undefined;
  }
}
export class AnchorSeries {}
export class AnchorPresenter {
  private anchorPanels = new Map<string, vscode.WebviewPanel>();
  constructor(public app: AppStore) {
    // app.logger.debug("[AnchorPresenter]");
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(
        CMD.estate.bookmark.read,
        async (uid: string, node: EstateNode, anchor: Anchor, ...args) => {
          await vscode.commands.executeCommand("setContext", "estate.hasAnchor", true);
          await this.app.tree.treeView.reveal(node, {
            expand: true,
            focus: false,
            select: true,
          });

          if (args[0]) {
            vscode.window.showInformationMessage("good work!");
          }
          // let activity: AnchorActivity = {
          //   type: "anchor",
          //   anchor,
          //   editor: vscode.window.activeTextEditor,
          // };
          // this.app.activity.emit(activity);
          // await this.showAnchor(anchor);
          // await this.refresh(activity);
          this.showAnchor(anchor);
        },
        this,
      ),
    );
    app.activity.subscribe(async (a: AppActivity) => {
      // app.logger.debug("[AnchorPresenter.constructor].construct");
      if (!a.editor) return;
      // Use a type guard to narrow the union type
      if (a.type === "anchor") {
        //   await this.refresh(a); // TypeScript now knows 'a' is strictly AnchorActivity
      }
    });
  }
  async refresh(a: AnchorActivity) {
    this.showAnchor(a.anchor);
  }
  private async showAnchor(anchor: Anchor, mode: "source" | "page" | "popup" = "source") {
    const id = anchor.id;
    //
    // Source view
    //
    if (mode === "source") {
      if (!anchor.uri()) {
        return;
      }
      // console.log("Hi there showAnchor");
      // TODO:
      // Fix bug, logic is right but it takes a second click to show buttons in editor tabs row
      // console.log("estate.hasAnchor =", true);
      // await vscode.commands.executeCommand("setContext", "estate.hasAnchor", true);
      const uri = vscode.Uri.file(anchor.uri());

      let editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === uri.toString(),
      );

      if (!editor) {
        const doc = await vscode.workspace.openTextDocument(uri);
        editor = await vscode.window.showTextDocument(doc, {
          preview: false,
        });
      } else {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      }

      const pos = new vscode.Position(anchor.src?.startLine ?? 0, anchor.src?.startCharacter ?? 0);

      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

      return;
    }
    //
    // Popup (TODO)
    //
    if (mode === "popup") {
      // TODO
      return;
    }
    //
    // Page
    //
    const existingPanel = this.anchorPanels.get(id);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      existingPanel.webview.html = anchorShowPage(anchor);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "anchor",
      anchor.label ?? "Anchor",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.anchorPanels.set(id, panel);

    panel.onDidDispose(() => {
      this.anchorPanels.delete(id);
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "saveAnchor":
            // this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;

          case "openSource":
            await this.showAnchor(anchor, "source");
            break;

          case "openPopup":
            await this.showAnchor(anchor, "popup");
            break;

          case "openPage":
            await this.showAnchor(anchor, "page");
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );

    panel.webview.html = anchorShowPage(anchor);
  }
  // - Hover
  // - Preview
  // - Full
  // - Panel
  async showRightlick(foo: any) {
    vscode.window.showInformationMessage("hi", foo);
  }
  async showAnchorPane(anchor: Anchor) {
    const id = anchor.id;

    // 1. Focus existing anchor panel
    const existingPanel = this.anchorPanels.get(id);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      // Optionally push fresh data if needed
      existingPanel.webview.postMessage({ type: "loadAnchor", anchor });
      return;
    }

    // 2. Create anchor panel
    const panel = vscode.window.createWebviewPanel(
      "anchor",
      anchor.label ?? "Anchor",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // Optional: restrict resource loading to your extension directory
        localResourceRoots: [vscode.Uri.file(path.join(this.app.ctx.extensionPath, "media"))],
      },
    );

    this.anchorPanels.set(id, panel);
    panel.onDidDispose(() => {
      this.anchorPanels.delete(id);
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "saveAnchor":
            // this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            vscode.window.showInformationMessage(`Saved anchor ${id}`);
            break;
          case "openSource":
            this.openAnchorSource(anchor);
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );

    // 3. Load HTML from file path safely
    panel.webview.html = this.getHtmlForWebview(panel.webview, anchor);
  }
  private getHtmlForWebview(webview: vscode.Webview, anchor: Anchor): string {
    const htmlPath = path.join(this.app.ctx.extensionPath, "media", "pipeline.html");
    let htmlContent = fs.readFileSync(htmlPath, "utf8");

    // Optional: Handle CSP (Content Security Policy) or local file URIs if using local scripts/styles.
    // If loading scripts via CDN (like the toolkit snippet above), it's straightforward.

    // Inject initial anchor state directly into a script tag so it's ready on DOMContentLoaded,
    // or send it via postMessage immediately. Here we inject a bootstrap script:
    const bootstrapScript = `
    <script>
      window.initialAnchor = ${JSON.stringify(anchor)};
    </script>
  `;

    return htmlContent.replace("</head>", `${bootstrapScript}</head>`);
  }
  private async showAnchorPane2(anchor: Anchor) {
    const id = anchor.id;

    // 1. Focus existing anchor panel
    //
    const existingPanel = this.anchorPanels.get(id);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      return;
    }

    //
    // 2. Create anchor panel
    //
    const panel = vscode.window.createWebviewPanel(
      "anchor",
      anchor.label ?? "Anchor",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    this.anchorPanels.set(id, panel);
    panel.onDidDispose(() => {
      this.anchorPanels.delete(id);
    });
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "saveAnchor":
            // this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;
          case "openSource":
            this.openAnchorSource(anchor);
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );
    panel.webview.html = anchorShowPage(anchor);
  }
  private async openAnchorSource(anchor: Anchor) {
    if (!anchor.uri()) {
      return;
    }
    const uri = vscode.Uri.file(anchor.uri());
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, {
      preview: false,
    });
    const pos = new vscode.Position(anchor.src?.startLine ?? 0, anchor.src?.startCharacter ?? 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
  private async showPagePane(
    anchor: Anchor,
    options: {
      openSource?: boolean;
    } = {},
  ) {
    const id = anchor.id;

    //
    // 1. Optionally open source file
    //
    if (options.openSource && anchor.uri()) {
      const uri = vscode.Uri.file(anchor.uri());

      let editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === uri.toString(),
      );
      if (!editor) {
        const doc = await vscode.workspace.openTextDocument(uri);
        editor = await vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: false,
        });
      } else {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      }
      // await vscode.commands.executeCommand("setContext", "estate.hasAnchor", true);
      const pos = new vscode.Position(anchor.src?.startLine ?? 0, anchor.src?.startCharacter ?? 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      return;
    }

    // this.showAnchorPane(anchor);

    //
    // 2. Update existing panel
    //
    const existingPanel = this.anchorPanels.get(id);
    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      existingPanel.webview.html = anchorShowPage(anchor);
      return;
    }

    //
    // 3. Create new panel
    //
    const panel = vscode.window.createWebviewPanel(
      "anchor",
      anchor.label ?? "Anchor",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.anchorPanels.set(id, panel);

    panel.onDidDispose(() => {
      this.anchorPanels.delete(id);
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "saveAnchor":
            // this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;

          case "openSource":
            await this.showPagePane(anchor, {
              openSource: true,
            });
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );

    // panel.webview.html = anchorShowPage(anchor);
    panel.webview.html = anchorShowPage(anchor);
  }
  async present(_ctx: vscode.ExtensionContext, anchor: Anchor) {
    const panel = vscode.window.createWebviewPanel(
      "estateAnchor",
      "Edit Anchor",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
      },
    );
    if (!anchor) return;
    panel.webview.html = getHtml(anchor);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "save") {
        // this.app.anchors.update(anchor?.id || "", msg.anchor);
        // this.app.tree.refresh();
        vscode.window.showInformationMessage("Anchor saved.");
      }
    });
  }
  showRef(_ctx: vscode.ExtensionContext, _app: AppStore) {
    // vscode.languages.registerHoverProvider('your-language', {
    //   provideHfover(document, position, token) {
    //     // Return markdown or text that floats dynamically
    //     return new vscode.Hover();
    //   },
    // });

    function createStatusBar() {
      // 1. Create a status bar item aligned to the right (or left)
      const refStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100, // Priority
      );
      // 2. Style it to stand out slightly as a notification/reference
      refStatusBar.text = "$(info) Reference: Keep typing...";
      refStatusBar.tooltip = "This stays out of your way and auto-hides.";
      refStatusBar.show();
      // 3. Make it automatically close/hide after a few seconds or when an action completes
      let hideTimeout: NodeJS.Timeout;
      function showTransientReference(message: string, durationMs = 3000) {
        refStatusBar.text = `$(info) ${message}`;
        refStatusBar.show();
        // Clear any existing timer
        if (hideTimeout) clearTimeout(hideTimeout);
        // Auto-dismiss after the duration
        hideTimeout = setTimeout(() => {
          refStatusBar.hide();
        }, durationMs);
      }
      // Example usage: trigger this when a specific action happens
      showTransientReference("Action complete - reference updated", 4000);
    }
    // createStatusBar();
    // const panel = vscode.window.createWebviewPanel(
    //   'giantPalette',
    //   'Command Palette View',
    //   vscode.ViewColumn.One,
    //   {
    //     enableScripts: true,
    //     retainContextWhenHidden: true,
    //   },
    // );
    // panel.webview.html = getModalHtml();
    // vscode.window.createQuickPick().show();
    // const panel = vscode.window.createWebviewPanel(
    //   'estateRecent',
    //   'Reference',
    //   vscode.ViewColumn.One,
    //   {
    //     retainContextWhenHidden: true,
    //     enableScripts: true,
    //   },
    // );
    //     panel.webview.html = `
    // <html>
    // <body>
    // <h1>Recent Semantic Nodes</h1>
    // <div>
    //   1. OwnershipVisitor::visit_local
    // </div>
    // <div>
    //   2. NodeResolver::resolve
    // </div>
    // <div>
    //   3. Workspace::analyze
    // </div>
    // </body>
    // </html>
    // `;
  }
}
