import * as fs from 'fs';
import * as fsPromise from 'node:fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EstateContext, EstateFlag } from '../estate';
import { randomUUID } from 'node:crypto';
import { AppStore } from '../app';
import { capability, CMD, flags } from '../cmds';
import { bookmarkShowPage, getHtml } from './htmlBookmark';
import { Activity } from '../activity';
// # Flag
// - Fold flags: show prevent 'above' from 'unfolding' no matter how many depths I've unfolded. Think about how I might want to 'ignore' tests of rust or imports or 'first impl'
// # Bookmark capabilities
// seed: a bookmark which is saved to disk with no other capabilities attached
//  - personal
//  - 'web bookmark' for code blocks
// overlay: a 'local' bookmark which is injected into a 'public' repo/file/commit. Creates a copy of itself into the .estate of that repo
// clone: a synced 'bookmark' that auto follows counter party source
//  - think of it as
// fork: a bookmark that creates a copy of the original but with the intention of not remaining the same and done explicitly to see that 'this is the reason why we did this'.
//  - consider adding it as a 'prev' version with 'x y z' reasons we did this or that.
// series: enables progression ui 'move through'.
//  - 1. lexer, 2. parser, 3, type checking
// option: enables picking one of more
//  - graph problems: dfs, bfs, etc.
// interface augments types
export interface Bookmark {
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
  //   uri: String;
  origin: BookmarkOrigin;
  anchors: BookmarkAnchor[];
}
// Runtime
export class Bookmark {
  id: string;
  label?: string;
  src?: BookmarkSource;
  tags: string[] = [];
  capabilities: EstateFlag[] = [];
  constructor(id: string, data: Partial<Bookmark>) {
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
export type BookmarkOrigin = 'system' | 'personal' | 'workspace';
export interface BookmarkSource {
  uri: string;
  startLine: number;
  endLine: number;
  startCharacter?: number;
  endCharacter?: number;
  languageId?: string;
}
export interface BookmarkOccurrence extends Anchor {}
export interface FlagOccurrence extends Anchor {
  flag: EstateFlag;
}
export type Occurrence = BookmarkOccurrence | FlagOccurrence;
// CRUD
// - [ ] Create
// - [ ] Read
// - [ ] Update
// - [ ] Delete
export interface BookmarkStoreType {
  //
  get(id: string): Bookmark | undefined;
  loadRegistry(path: string): void;
  save(): void;
  create(
    ctx: EstateContext,
    opts: CreateBookmarkOptions,
    bookmark: Partial<Bookmark>,
  ): Partial<Bookmark>;
  update(id: string, patch: Partial<Bookmark>): void;
  delete(id: string): void;
  find(file: vscode.Uri, text: string, line: number): Occurrence[];
  list(): Bookmark[];
  hasFlag(id: string): boolean;
  getFlag(id: string): EstateFlag | undefined;
}
export class BookmarkStore implements BookmarkStoreType {
  private items = new Map<string, Bookmark>();
  private fileIndex = new Map<string, Bookmark[]>();
  // 1. Add to items and fileIndex when creating
  // 2. Use fileIndex for embedded(or over all, so we dont have to do "row by row scan")
  private flags = new Map<string, EstateFlag>();
  private registryPath = path.join(os.homedir(), '.estate', 'bookmark.json');
  public roots: any[] = [];
  private bookmarkDecoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file('/path/to/bookmark.svg'),
    overviewRulerColor: '#888888',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: 'Hi there! 🔖',
    },
  });
  private decorateBookmarks(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.fsPath;
    const ranges: vscode.Range[] = [];
    for (const bookmark of this.list()) {
      if (!bookmark?.src) {
        continue;
      }
      if (bookmark.src.uri !== uri) {
        continue;
      }
      ranges.push(
        new vscode.Range(
          bookmark.src.startLine,
          bookmark.src.startCharacter ?? 0,
          bookmark.src.endLine,
          bookmark.src.endCharacter ?? 0,
        ),
      );
    }
    editor.setDecorations(this.bookmarkDecoration, ranges);
  }
  constructor(public app: AppStore) {
    this.bookmarkDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        margin: '0 0 0 1rem',
        color: new vscode.ThemeColor('descriptionForeground'),
        fontStyle: 'italic',
      },
    });
    const estates = this.findEstates();
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'bookmark.json'));
    }
    this.initIntrinsic();
    this.initializeRegistry();
    // ⚠️ Careful!
    // - Pass app, ctx, or a 3rd argument to have it later. Otherwise the properties of this will be lost
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(CMD.bookmark.create, this.addBookmark, this),
      vscode.commands.registerCommand(CMD.bookmark.edit, this.update, this),
    );
    app.activity.subscribe(() => {
      //   console.log('Bookmark store... activity detcted');
      //   this.decorateBookmarks();
    });
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
    const registry = path.join(estate, 'registry', 'bookmarks.json');
    if (!fs.existsSync(registry)) {
      return;
    }
    const json = JSON.parse(fs.readFileSync(registry, 'utf8'));
    for (const [id, bookmark] of Object.entries(json.items ?? {})) {
      this.items.set(id, bookmark as Bookmark);
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
    for (const [id, bookmark] of Object.entries(items as Record<string, Partial<Bookmark>>)) {
      const b = new Bookmark(id, bookmark);
      this.register(id, b);
    }
  }
  loadFsPath(filePath: string): void {
    const estates = this.findEstatesFs(filePath);
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'bookmark.json'));
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
  public async saveBookmark(patch: Partial<Bookmark>) {
    console.log('Hi');
    // if (!this.currentBookmark) {
    //   return;
    // }
    // this.app.bookmarks.update(this.currentBookmark.id, patch);
    // this.app.bookmarks.save();
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
  create(ctx: EstateContext, opts: CreateBookmarkOptions, bookmark: Partial<Bookmark>): Bookmark {
    const now = new Date().toISOString();
    let id = randomUUID();
    let b = new Bookmark(id, {
      id,
      tags: [],
      type: bookmark.type ?? 'concept',
      label: opts.label,
      description: bookmark.description ?? '',
      privacy: opts.privacy ?? 'personal',
      body: bookmark.body ?? '',
      context: bookmark.context ?? '',
      code: bookmark.code ?? '',
      repo: bookmark.repo ?? '',
      commit: bookmark.commit ?? '',
      scope: bookmark.scope ?? 'unknown',
      src: bookmark.src,
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
  async addBookmark(ctx: vscode.ExtensionContext, app: AppStore) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const selection = editor.selection;
    // if (selection.isEmpty) {
    //   // It is useful to save files with no content
    //   vscode.window.showWarningMessage('Select something to bookmark first');
    //   return;
    // }
    const document = editor.document;
    const selectedText = document.getText(selection);
    const id = `@${Date.now()}`;
    this.create(
      {
        bookmark: id,
        uri: document.uri,
        selection,
      },
      {
        label: `Bookmark ${id}`,
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
    //     `// ${id} linked estate bookmark\n`,
    //   );
    // });
    await this.save();
    vscode.window.showInformationMessage(`Created ${id}`);
  }
  register(id: string, bookmark: Bookmark) {
    try {
      this.items.set(id, bookmark);
      const key = bookmark.uri().toString();
      const list = this.fileIndex.get(key) ?? [];
      list.push(bookmark);
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
  getUri(b: Bookmark): vscode.Uri {
    if (!b?.src?.uri) {
      throw Error('Invalid Uri');
    }
    return vscode.Uri.file(b.src.uri);
  }
  ids() {
    return [...this.items.keys()];
  }
  list(): Bookmark[] {
    return [...this.items.values()];
  }
  inFile(b: Bookmark, file: vscode.Uri) {
    return file == this.getUri(b);
  }
  find(file: vscode.Uri, text: string, line: number): Occurrence[] {
    const results = [...findBookmarks(text, this, line), ...findFlags(text, this, line)];
    for (const bookmark of this.findSortedIndex(file, line)) {
      console.log('bookmarkbookmark', bookmark);
      console.log('bookmarkbookmark', bookmark.id);
      results.push({
        id: bookmark.id,
        line,
        start: bookmark.src!.startCharacter ?? 0,
        end: bookmark.src!.endCharacter ?? 0,
      });
    }
    return results;
  }
  findInFile(file: vscode.Uri): Bookmark[] {
    return this.list().filter((b) => this.inFile(b, file));
  }
  findSortedIndex(file: vscode.Uri, line: number): Bookmark[] {
    return this.findInIndex(file).filter(
      (b) => b.src && line >= b.src.startLine && line <= b.src.endLine,
    );
  }
  findInIndex(file: vscode.Uri): Bookmark[] {
    return this.fileIndex.get(file.toString()) ?? [];
  }
  update(
    id: string,
    patch: Partial<Bookmark>,
    // opts: CreateBookmarkOptions,
  ): Bookmark {
    throw new Error('BookmarkStore.create() has not been implemented.');
  }
  delete(id: string) {
    throw new Error('TODO');
  }
  // @connected
  // Globals available as u type
  registerFlag(flag: EstateFlag): void {
    this.flags.set(flag.id, flag);
  }
  getRange(b: Bookmark) {
    try {
      let { src } = b;
      if (!src) throw Error('Invalid Bookmark');
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
export enum BookmarkLocation {
  Personal,
  Workspace,
  Project,
}
export interface CreateBookmarkOptions {
  label?: string;
  description?: string;
  privacy: 'personal' | 'repo' | 'workspace';
  captureCode?: boolean;
  captureScope?: boolean;
  captureContext?: boolean;
}
export interface BookmarkOccurrence {
  id: string;
  line: number;
  start: number;
  end: number;
}
export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: string;
}
export interface Anchor {
  id: string;
  line: number;
  start: number;
  end: number;
}
export function findAnchors(text: string, line: number): Anchor[] {
  const results: Anchor[] = [];
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
export function findBookmarks(
  text: string,
  store: BookmarkStore,
  line: number,
): BookmarkOccurrence[] {
  return findAnchors(text, line)
    .filter((t) => store.has(t.id))
    .map((t) => ({ ...t }));
}
export function findFlags(text: string, store: BookmarkStore, line: number): FlagOccurrence[] {
  return findAnchors(text, line).flatMap((t) => {
    const flag = store.getFlag(t.id);
    return flag ? [{ ...t, flag }] : [];
  });
}
export class BookmarkSeries {}
export class BookmarkPresenter {
  private bookmarkPanels = new Map<string, vscode.WebviewPanel>();
  constructor(public app: AppStore) {
    app.ctx.subscriptions.push(
      vscode.commands.registerCommand(CMD.bookmark.open, this.showPagePane, this),
      //   vscode.commands.registerCommand(CMD.refPanel.open, (ctx) => this.showRef(ctx, app), this),
      vscode.commands.registerCommand(
        CMD.bookmark.present,
        async (ctx, bookmark: Bookmark) => {
          await this.present(ctx, bookmark);
        },
        this,
      ),
    );
    // TODO: Doesn't Work
    app.activity.subscribe((a: Activity) => {
      if (!a.editor) return;
      console.log(
        'this.findInFile(app.activity.current().editor.uri)',
        app.bookmarks.findInFile(a.editor.uri),
      );
    });
  }
  // - Hover
  // - Preview
  // - Full
  // - Panel
  private async showPagePane(bookmark: Bookmark) {
    const id = bookmark.id;
    const language = languageForBookmark(bookmark);
    const doc = await vscode.workspace.openTextDocument({
      language,
      content: bookmark.code ?? bookmark.body ?? '',
    });
    //
    // 1. Focus existing bookmark panel
    //
    const existingPanel = this.bookmarkPanels.get(id);

    if (existingPanel) {
      existingPanel.reveal(vscode.ViewColumn.Active);
      return;
    }

    //
    // 2. Open/reveal source file
    //
    if (bookmark.uri()) {
      const uri = vscode.Uri.file(bookmark.uri());

      let editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === uri.toString(),
      );

      if (editor) {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn);
      } else {
        const doc = await vscode.workspace.openTextDocument(uri);

        editor = await vscode.window.showTextDocument(doc, {
          preview: false,
          preserveFocus: false,
        });
      }

      //
      // 3. Jump to bookmark location
      //
      const pos = new vscode.Position(
        bookmark.src?.startLine ?? 0,
        bookmark.src?.startCharacter ?? 0,
      );

      editor.selection = new vscode.Selection(pos, pos);

      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }

    //
    // 4. Create bookmark panel
    //
    const panel = vscode.window.createWebviewPanel(
      'bookmark',
      bookmark.label ?? 'Bookmark',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
      },
    );

    this.bookmarkPanels.set(id, panel);

    panel.onDidDispose(() => {
      this.bookmarkPanels.delete(id);
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        vscode.window.showInformationMessage(`Saving`);
        switch (message.type) {
          case 'saveBookmark':
            this.app.bookmarks.update(id, message.bookmark);
            this.app.bookmarks.save();
            break;
        }
      },
      undefined,
      this.app.ctx.subscriptions,
    );

    panel.webview.html = bookmarkShowPage(bookmark);
  }
  async present(ctx: vscode.ExtensionContext, bookmark: Bookmark) {
    const panel = vscode.window.createWebviewPanel(
      'estateBookmark',
      'Edit Bookmark',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
      },
    );
    if (!bookmark) return;
    panel.webview.html = getHtml(bookmark);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'save') {
        this.app.bookmarks.update(bookmark?.id || '', msg.bookmark);
        this.app.tree.refresh();
        vscode.window.showInformationMessage('Bookmark saved.');
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
export interface BookmarkAnchor {
  uri: vscode.Uri;
  line: number;
  // optional placement info
  start?: number;
  end?: number;
  // why it exists
  source: 'reference' | 'position';
}
function getModalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <style>
        /* Reset and fill the entire webview tab area */
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.4); /* Dim the editor behind it */
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        /* The Giant Centered "Command Palette" Box */
        .modal-container {
            width: 70vw;          /* Takes up 70% of your screen width */
            height: 60vh;         /* Takes up 60% of your screen height */
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border, #444);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: fadeIn 0.15s ease-out;
        }
        /* Subtle scale-up animation */
        @keyframes fadeIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        /* Palette Input Header */
        .palette-input {
            width: 100%;
            padding: 16px;
            font-size: 18px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: none;
            border-bottom: 1px solid var(--vscode-widget-border, #444);
            outline: none;
            box-sizing: border-box;
        }
        /* Results Area */
        .palette-results {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }
        .palette-item {
            padding: 10px 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        .palette-item:hover, .palette-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
    </style>
</head>
<body>
    <div class="modal-container">
        <input type="text" class="palette-input" placeholder="Type a command or search reference..." autofocus />
        <div class="palette-results">
            <div class="palette-item active">First giant suggestion item</div>
            <div class="palette-item">Second reference module</div>
            <div class="palette-item">Third option block</div>
        </div>
    </div>
    <script>
        // Close automatically when user hits Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Send message back to extension to close panel
                const vscode = acquireVsCodeApi();
                vscode.postMessage({ command: 'close' });
            }
        });
    </script>
</body>
</html>`;
}
// Define a custom interface extending QuickPickItem to hold extra data

function languageForBookmark(bookmark: Bookmark): string {
  const ext = path.extname(bookmark.uri()).toLowerCase();

  switch (ext) {
    case '.rs':
      return 'rust';
    case '.ts':
      return 'typescript';
    case '.js':
      return 'javascript';
    case '.html':
      return 'html';
    case '.css':
      return 'css';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}
