import * as fs from 'fs';
import * as fsPromise from 'node:fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EstateContext, EstateFlag } from '../estate';
import { randomUUID } from 'node:crypto';
import { AppStore } from '../app';
import { capability, flags } from '../cmd/cmd';
import { CMD } from '../../generated/cmd';
import { anchorShowPage, getHtml } from './htmlAnchor';
import { AnchorActivity, AppActivity } from '../activity';
import { PATHS } from '../cfg';
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
// Runtime
export class Anchor {
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
      throw new Error('Invalid URI');
    }
    return this.src.uri.toString();
  }
}
export type AnchorOrigin = 'system' | 'personal' | 'workspace';
export interface AnchorSource {
  uri: string;
  startLine: number;
  endLine: number;
  startCharacter?: number;
  endCharacter?: number;
  languageId?: string;
}
// CRUD
// - [ ] Create
// - [ ] Read
// - [ ] Update
// - [ ] Delete
export interface AnchorStoreType {
  //
  get(id: string): Anchor | undefined;
  loadRegistry(path: string): void;
  save(): void;
  create(ctx: EstateContext, opts: CreateAnchorOptions, anchor: Partial<Anchor>): Partial<Anchor>;
  update(id: string, patch: Partial<Anchor>): void;
  delete(id: string): void;
  find(file: vscode.Uri, text: string, line: number): AnchorRef[];
  findByUri(uri: vscode.Uri): Anchor[];

  list(): Anchor[];
  hasFlag(id: string): boolean;
  getFlag(id: string): EstateFlag | undefined;
}
export class AnchorStore implements AnchorStoreType {
  private items = new Map<string, Anchor>();
  private fileIndex = new Map<string, Anchor[]>();
  // 1. Add to items and fileIndex when creating
  // 2. Use fileIndex for embedded(or over all, so we dont have to do "row by row scan")
  private flags = new Map<string, EstateFlag>();
  private registryPath = PATHS.anchors();
  public roots: any[] = [];
  private anchorDecoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file('/path/to/anchor.svg'),
    overviewRulerColor: '#888888',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: 'Hi there! 🔖',
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
    this.anchorDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        margin: '0 0 0 1rem',
        color: new vscode.ThemeColor('descriptionForeground'),
        fontStyle: 'italic',
      },
    });
    const estates = this.findEstates();
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'anchors.json'));
    }
    this.initIntrinsic();
    this.initializeRegistry();
    // ⚠️ Careful!
    // - Pass app, ctx, or a 3rd argument to have it later. Otherwise the properties of this will be lost
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(CMD.estate.bookmark.create, this.addAnchor, this),
      vscode.commands.registerCommand(CMD.estate.bookmark.update, this.update, this),
    );
    app.activity.subscribe(() => {
      //   console.log('Anchor store... activity detcted');
      //   this.decorateAnchors();
    });

    console.log('this.registryPath', this.registryPath);
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
  initializeRegistry(): void {
    const estate = this.resolveRegistry();
    if (!estate) {
      return;
    }
    const registry = path.join(estate, 'registry', PATHS.anchors());
    if (!fs.existsSync(registry)) {
      return;
    }
    const json = JSON.parse(fs.readFileSync(registry, 'utf8'));
    for (const [id, anchor] of Object.entries(json.items ?? {})) {
      this.items.set(id, anchor as Anchor);
    }
  }
  public loadRegistry(file: string): void {
    if (!fs.existsSync(file)) {
      console.log('Missing registry:', file);
      return;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    const items = json.items ?? {};
    console.log('itemsitems', items);
    for (const [id, anchor] of Object.entries(items as Record<string, Partial<Anchor>>)) {
      const b = new Anchor(id, anchor);
      this.register(id, b);
    }
  }
  loadFsPath(filePath: string): void {
    const estates = this.findEstatesFs(filePath);
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'anchors.json'));
    }
  }
  private findEstates(): string[] {
    const estates: string[] = [];
    const homeEstate = path.join(os.homedir(), '.estate');
    if (fs.existsSync(homeEstate)) {
      estates.push(homeEstate);
    }
    return estates;
  }
  private findEstatesFs(filePath: string): string[] {
    const estates: string[] = [];
    let current = path.dirname(filePath);
    while (true) {
      const candidate = path.join(current, '.estate');
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
  public async saveAnchor(patch: Partial<Anchor>) {
    // if (!this.currentAnchor) {
    //   return;
    // }
    // this.app.anchors.update(this.currentAnchor.id, patch);
    // this.app.anchors.save();
  }
  //   private findEstate(startPath: string): string | undefined {
  //     let current = path.resolve(startPath);
  //
  //
  //
  //    while (true) {
  //       const candidate = path.join(current, '.estate');
  //       if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
  //         return candidate;
  //       }
  //       const parent = path.dirname(current);
  //       if (parent === current) {
  //         break;
  //       }
  //       current = parent;
  //     }
  //     return undefined;
  //   }
  create(ctx: EstateContext, opts: CreateAnchorOptions, anchor: Partial<Anchor>): Anchor {
    const now = new Date().toISOString();
    let id = randomUUID();
    let b = new Anchor(id, {
      id,
      tags: [],
      type: anchor.type ?? 'concept',
      label: opts.label,
      description: anchor.description ?? '',
      privacy: opts.privacy ?? 'personal',
      body: anchor.body ?? '',
      context: anchor.context ?? '',
      code: anchor.code ?? '',
      repo: anchor.repo ?? '',
      commit: anchor.commit ?? '',
      scope: anchor.scope ?? 'unknown',
      src: anchor.src,
      anchors: [],
      origin: 'personal',
      createdAt: now,
      updatedAt: now,
      scratchpadBody: '',
      scratchpadExt: '',
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
    const id = `@${Date.now()}`;
    this.create(
      {
        anchor: id,
        uri: document.uri,
        selection,
      },
      {
        label: `Anchor ${id}`,
        description: 'Captured source block',
        privacy: 'workspace',
      },
      {
        type: 'code',
        body: selectedText,
        scope: 'source.selection',
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
    vscode.window.showInformationMessage(`Created ${id}`);
  }
  findByUri(uri: vscode.Uri): Anchor[] {
    const target = uri.toString();
    return this.list().filter((anchor) =>
      anchor.locations?.some((location) => location.uri === target),
    );
  }
  register(id: string, anchor: Anchor) {
    console.log('registering');
    try {
      this.items.set(id, anchor);
      const key = anchor.uri().toString();
      const list = this.fileIndex.get(key) ?? [];
      list.push(anchor);
      list.sort((a, b) => a.src.startLine - b.src.startLine);
      this.fileIndex.set(key, list);
    } catch (error) {
      vscode.window.showErrorMessage(`Error saving.`);
    }
  }
  async save(): Promise<void> {
    const data = {
      items: Object.fromEntries(this.items),
    };
    console.log('this.registryPath', this.registryPath);
    await fsPromise.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fsPromise.writeFile(this.registryPath, JSON.stringify(data, null, 2), 'utf8');
  }
  get(id: string) {
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
  getUri(b: Anchor): vscode.Uri {
    if (!b?.src?.uri) {
      throw Error('Invalid Uri');
    }
    return vscode.Uri.file(b.src.uri);
  }
  ids() {
    return [...this.items.keys()];
  }
  list(): Anchor[] {
    return [...this.items.values()];
  }
  inFile(b: Anchor, file: vscode.Uri) {
    return file == this.getUri(b);
  }
  find(file: vscode.Uri, text: string, line: number): AnchorRef[] {
    const results = [...findAnchors(text, this, line), ...findFlags(text, this, line)];
    for (const anchor of this.findSortedIndex(file, line)) {
      console.log('anchoranchor', anchor);
      console.log('anchoranchor', anchor.id);
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
    return this.list().filter((b) => this.inFile(b, file));
  }
  findSortedIndex(file: vscode.Uri, line: number): Anchor[] {
    return this.findInIndex(file).filter(
      (b) => b.src && line >= b.src.startLine && line <= b.src.endLine,
    );
  }
  findInIndex(file: vscode.Uri): Anchor[] {
    return this.fileIndex.get(file.toString()) ?? [];
  }
  update(
    id: string,
    patch: Partial<Anchor>,
    // opts: CreateAnchorOptions,
  ): Anchor {
    throw new Error('AnchorStore.create() has not been implemented.');
  }
  delete(id: string) {
    throw new Error('TODO');
  }
  // @connected
  // Globals available as u type
  registerFlag(flag: EstateFlag): void {
    this.flags.set(flag.id, flag);
  }
  getRange(b: Anchor) {
    try {
      let { src } = b;
      if (!src) throw Error('Invalid Anchor');
      return new vscode.Range(
        src.startLine,
        src.startCharacter ?? 0,
        src.endLine,
        src.endCharacter ?? 0,
      );
    } catch (error) {
      console.log('Get Range Error: ', error);
    }
  }
  private registerFlagsUser(filePath: string): EstateFlag[] {
    const flags: EstateFlag[] = [
      {
        id: '1',
        label: 'save',
        description: 'hi',
        scope: 'language',
        action: 'wiki.click',
        capabilities: [],
      },
    ];
    return flags;
  }
  private resolveRegistry(): string | undefined {
    for (const root of this.roots) {
      let current = root;
      while (current !== path.dirname(current)) {
        const candidate = path.join(current, '.estate');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
        current = path.dirname(current);
      }
    }
    return undefined;
  }
}
export interface CreateAnchorOptions {
  label?: string;
  description?: string;
  privacy: 'personal' | 'repo' | 'workspace';
  captureCode?: boolean;
  captureScope?: boolean;
  captureContext?: boolean;
}

export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export function findFlags(text: string, store: AnchorStore, line: number): AnchorRef[] {
  return findAnchorsLocations(text, line).flatMap((t) => {
    const flag = store.getFlag(t.id);
    return flag ? [{ ...t, flag }] : [];
  });
}
export class AnchorSeries {}
export class AnchorPresenter {
  private anchorPanels = new Map<string, vscode.WebviewPanel>();
  constructor(public app: AppStore) {
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(
        CMD.estate.bookmark.read,
        async (anchor: Anchor) => {
          await vscode.commands.executeCommand('setContext', 'estate.hasAnchor', true);
          let activity: AnchorActivity = {
            type: 'anchor',
            anchor,
            editor: vscode.window.activeTextEditor,
          };
          this.app.activity.emit(activity);
          await this.showAnchor(anchor);
        },
        this,
      ),
    );
    app.activity.subscribe((a: AppActivity) => {
      if (!a.editor) return;
    });
  }
  private async showAnchor(anchor: Anchor, mode: 'source' | 'page' | 'popup' = 'source') {
    const id = anchor.id;

    //
    // Source view
    //
    if (mode === 'source') {
      if (!anchor.uri()) {
        return;
      }
      console.log('Hi there showAnchor');
      // TODO:
      // Fix bug, logic is right but it takes a second click to show buttons in editor tabs row
      console.log('estate.hasAnchor =', true);
      await vscode.commands.executeCommand('setContext', 'estate.hasAnchor', true);

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
    if (mode === 'popup') {
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
      'anchor',
      anchor.label ?? 'Anchor',
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
          case 'saveAnchor':
            this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;

          case 'openSource':
            await this.showAnchor(anchor, 'source');
            break;

          case 'openPopup':
            await this.showAnchor(anchor, 'popup');
            break;

          case 'openPage':
            await this.showAnchor(anchor, 'page');
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

  private async showAnchorPane(anchor: Anchor) {
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
      'anchor',
      anchor.label ?? 'Anchor',
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
          case 'saveAnchor':
            this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;
          case 'openSource':
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
      await vscode.commands.executeCommand('setContext', 'estate.hasAnchor', true);
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
      'anchor',
      anchor.label ?? 'Anchor',
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
          case 'saveAnchor':
            this.app.anchors.update(id, message.anchor);
            this.app.anchors.save();
            break;

          case 'openSource':
            await this.showPagePane(anchor, {
              openSource: true,
            });
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );

    panel.webview.html = anchorShowPage(anchor);
  }
  async present(ctx: vscode.ExtensionContext, anchor: Anchor) {
    const panel = vscode.window.createWebviewPanel(
      'estateAnchor',
      'Edit Anchor',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
      },
    );
    if (!anchor) return;
    panel.webview.html = getHtml(anchor);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'save') {
        this.app.anchors.update(anchor?.id || '', msg.anchor);
        this.app.tree.refresh();
        vscode.window.showInformationMessage('Anchor saved.');
      }
    });
  }
  showRef(ctx: vscode.ExtensionContext, app: AppStore) {
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
      refStatusBar.text = '$(info) Reference: Keep typing...';
      refStatusBar.tooltip = 'This stays out of your way and auto-hides.';
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
      showTransientReference('Action complete - reference updated', 4000);
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
export interface AnchorAnchor {
  //   uri: vscode.Uri;
  //   line: number;
  //   // optional placement info
  //   start?: number;
  //   end?: number;
  //   // why it exists
  //   source: 'reference' | 'position';
}
// export interface Anchor {
//   id: string;
//   label?: string;

//   // Organization
//   lists?: string[];

//   // Source references
//   locations?: AnchorLocation[];

//   // Content payload
//   type?: string;
//   body?: string;
//   code?: string;
//   context?: string;
//   scratchpadBody?: string;

//   // Metadata
//   repo?: string;
//   commit?: string;
//   scope?: string;
//   privacy?: string;

//   updatedAt?: string;
//   createdAt?: string;
// }
export interface AnchorList {
  id: string;
  label: string;
  parent?: string;
  anchors: string[];
}
export interface AnchorRef {
  id: string;
  line: number;
  start: number;
  end: number;
}
export function findAnchorsLocations(text: string, line: number): AnchorRef[] {
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
export function findAnchors(text: string, store: AnchorStore, line: number): AnchorRef[] {
  return findAnchorsLocations(text, line)
    .filter((t) => store.has(t.id))
    .map((t) => ({ ...t }));
}
export interface AnchorLocation {
  uri: string;
  line: number;
  start: number;
  end: number;
}
