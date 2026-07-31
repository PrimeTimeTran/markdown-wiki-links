import * as fs from 'fs';
import * as fsPromise from 'node:fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { EstateContext, EstateFlag, EstateTreeProvider, flags } from '../estate';
import { randomUUID } from 'node:crypto';
import { AppStore } from '../app';

const bookmark = ['create', 'read', 'update', 'delete'];

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

export interface Bookmark {
  id?: string;
  type?: string;
  description?: string;
  context?: string;
  label?: string;
  code?: string;
  repo?: string;
  commit?: string;
  scope?: string;
  privacy?: string;
  source?: BookmarkSource;
  body?: string;
  updatedAt?: string;
  createdAt?: string;
  tags: string[];
}
export interface BookmarkStoreType {
  get(id: string): Bookmark | undefined;
  load(path: string): void;
  save(): void;
  create(ctx: EstateContext, opts: CreateBookmarkOptions, bookmark: Partial<Bookmark>): Bookmark;
  update(id: string, patch: Partial<Bookmark>): void;
  delete(id: string): void;
  find(text: string, line: number): BookmarkOccurrence[] | FlagOccurrence[];
  list(): Bookmark[];
  hasFlag(id: string): boolean;
  getFlag(id: string): EstateFlag | undefined;
}

export class BookmarkStore implements BookmarkStoreType {
  private items = new Map<string, Bookmark>();
  private flags = new Map<string, EstateFlag>();
  private registryPath = path.join(os.homedir(), '.estate', 'bookmark.json');
  private bookmarkDecoration = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file('/path/to/bookmark.svg'),
    overviewRulerColor: '#888888',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      contentText: ' 🔖',
    },
  });
  private decorateBookmarks(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.fsPath;
    const ranges: vscode.Range[] = [];
    for (const bookmark of this.list()) {
      if (!bookmark?.source) {
        continue;
      }
      if (bookmark.source.uri !== uri) {
        continue;
      }
      ranges.push(
        new vscode.Range(
          bookmark.source.startLine,
          bookmark.source.startCharacter ?? 0,
          bookmark.source.endLine,
          bookmark.source.endCharacter ?? 0,
        ),
      );
    }
    editor.setDecorations(this.bookmarkDecoration, ranges);
  }
  constructor(app: AppStore) {
    this.init();
    app.activity.subscribe(() => {
      console.log('Bookmark store... activity detcted');
    });
  }

  init(): void {
    // @context
    // ⚠️ Must bind to capture lexical scope when registering commands.
    // vscode.commands.registerCommand('bookmark.create', this.addBookmark);
    // vscode.commands.registerCommand('bookmark.create', (ctx) => this.addBookmark(ctx, this.app));
    const estates = this.findEstates();
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'bookmark.json'));
    }
    this.initFlagsIntrinsic();
  }

  private findEstates(): string[] {
    const estates: string[] = [];
    const homeEstate = path.join(os.homedir(), '.estate');
    if (fs.existsSync(homeEstate)) {
      estates.push(homeEstate);
    }
    return estates;
  }

  //   private findEstate(startPath: string): string | undefined {
  //     let current = path.resolve(startPath);
  //     while (true) {
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
    return {
      tags: [],
      type: bookmark.type ?? 'concept',
      label: opts.label,
      description: opts.description ?? '',
      privacy: opts.privacy ?? 'personal',
      body: bookmark.body ?? '',
      context: bookmark.context ?? '',
      code: bookmark.code ?? '',
      repo: bookmark.repo ?? '',
      commit: bookmark.commit ?? '',
      scope: bookmark.scope ?? 'unknown',
      source: bookmark.source,
      createdAt: now,
      updatedAt: now,
    };
  }
  async addBookmark(ctx: vscode.ExtensionContext, app: AppStore) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    // app.bookmarks.
    const selection = editor.selection;
    if (selection.isEmpty) {
      vscode.window.showWarningMessage('Select something to bookmark first');
      return;
    }
    const document = editor.document;
    const selectedText = document.getText(selection);
    const id = `@${Date.now()}`;
    const bookmark = this.create(
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
        code: selectedText,
        context: selectedText,

        scope: 'source.selection',

        source: {
          uri: document.uri.fsPath,
          startLine: selection.start.line,
          endLine: selection.end.line,
          startCharacter: selection.start.character,
          endCharacter: selection.end.character,
          languageId: document.languageId,
        },
      },
    );
    this.register(id, bookmark);
    await this.save();

    // await editor.edit((edit) => {
    //   edit.insert(
    //     new vscode.Position(selection.start.line, 0),
    //     `// ${id} linked estate bookmark\n`,
    //   );
    // });

    vscode.window.showInformationMessage(`Created ${id}`);
  }
  register(id: string, bookmark: Bookmark): void {
    this.items.set(id, bookmark);
  }
  async save(): Promise<void> {
    const data = {
      items: Object.fromEntries(this.items),
    };
    await fsPromise.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fsPromise.writeFile(this.registryPath, JSON.stringify(data, null, 2), 'utf8');
  }
  load(): void {
    const estate = this.resolveEstate();
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
  //   static fromPath(filePath: string): BookmarkStore {
  //     const store = new BookmarkStore();
  //     store.loadFsPath(filePath);
  //     return store;
  //   }
  loadFsPath(filePath: string): void {
    const estates = this.findEstatesFs(filePath);
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'bookmark.json'));
    }

    // for (const flag of flags) {
    //   this.registerFlags();
    // }
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
  ids() {
    return [...this.items.keys()];
  }
  list() {
    return [...this.items.values()];
  }
  find(text: string, line: number): BookmarkOccurrence[] | FlagOccurrence[] {
    return [...findBookmarks(text, this, line), ...findFlags(text, this, line)];
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
  private loadRegistry(file: string): void {
    if (!fs.existsSync(file)) {
      console.log('Missing registry:', file);
      return;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    for (const [id, bookmark] of Object.entries(json.items ?? {})) {
      console.log('ADDING:', id);
      this.items.set(id, bookmark as Bookmark);
    }
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

  // @connected
  // Globals available as u type
  private initFlagsIntrinsic(): EstateFlag[] {
    for (const f of flags) {
      this.registerFlag(f);
    }
    return flags;
  }
  registerFlag(flag: EstateFlag): void {
    this.flags.set(flag.id, flag);
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
  private resolveEstate(): string | undefined {
    // for (const root of this.roots) {
    //   let current = root;
    //   while (current !== path.dirname(current)) {
    //     const candidate = path.join(current, '.estate');
    //     if (fs.existsSync(candidate)) {
    //       return candidate;
    //     }
    //     current = path.dirname(current);
    //   }
    // }
    return undefined;
  }
}
export enum BookmarkLocation {
  Personal,
  Workspace,
  Project,
}
export interface CreateBookmarkOptions {
  id?: string;
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
export interface FlagOccurrence {
  id: string;
  line: number;
  start: number;
  end: number;
  flag: EstateFlag;
}
export function findBookmarks(
  text: string,
  store: BookmarkStore,
  line: number,
): BookmarkOccurrence[] {
  const results: BookmarkOccurrence[] = [];
  const regex = /@[A-Za-z0-9_-]+/g;
  for (const match of text.matchAll(regex)) {
    const id = match[0];
    if (!store.has(id)) {
      continue;
    }
    console.log(`findBookmarks, {id}`, id);
    results.push({
      id,
      line,
      start: match.index!,
      end: match.index! + id.length,
    });
  }

  return results;
}
export function findFlags(text: string, store: BookmarkStore, line: number): FlagOccurrence[] {
  const results: FlagOccurrence[] = [];
  const regex = /@[A-Za-z0-9_-]+/g;

  for (const match of text.matchAll(regex)) {
    // console.log(`Flag: ${match}`);
    const id = match[0];
    const flag = store.getFlag(id);
    if (!flag) {
      continue;
    }
    results.push({
      id,
      line,
      start: match.index!,
      end: match.index! + id.length,
      flag,
    });
  }
  return results;
}

export interface BookmarkSource {
  uri: string;
  startLine: number;
  endLine: number;
  startCharacter?: number;
  endCharacter?: number;
  languageId?: string;
}

function getHtml(bookmark: Bookmark): string {
  return /* html */ `

<!DOCTYPE html>

<html>

<head>

<style>

body{
    font-family: sans-serif;
    padding:24px;
}

label{
    display:block;
    margin-top:16px;
    font-weight:bold;
}

input,
select,
textarea{

    width:100%;
    box-sizing:border-box;
    padding:8px;
    margin-top:6px;

}

textarea{

    height:180px;

}

.tags{

    margin-top:8px;

}

.tag{

    display:block;
    margin:4px 0;

}

button{

    margin-top:24px;
    padding:10px 24px;

}

</style>

</head>

<body>

<label>Label</label>

<input id="label"
value="${bookmark.label}">

<label>Description</label>

<input id="description"
value="${bookmark.description}">

<label>Scope</label>

<select id="scope">

<option>workspace</option>
<option>package</option>
<option>module</option>
<option>file</option>
<option selected>markdown.heading</option>
<option>function</option>

</select>

<label>Privacy</label>

<select id="privacy">

<option selected>personal</option>
<option>workspace</option>
<option>public</option>

</select>

<label>Tags</label>

<div class="tags">

${renderTag('architecture', bookmark.tags)}
${renderTag('parser', bookmark.tags)}
${renderTag('compiler', bookmark.tags)}
${renderTag('rust', bookmark.tags)}
${renderTag('vscode', bookmark.tags)}

</div>

<label>Body</label>

<textarea id="body">${bookmark.body}</textarea>

<button id="save">
Save Bookmark
</button>

<script>

const vscode = acquireVsCodeApi();

document
.getElementById("save")
.onclick = () => {

    const tags =
        [...document.querySelectorAll(".tag input")]
            .filter(x=>x.checked)
            .map(x=>x.value);

    vscode.postMessage({

        type:"save",

        bookmark:{

            label:
                document.getElementById("label").value,

            description:
                document.getElementById("description").value,

            scope:
                document.getElementById("scope").value,

            privacy:
                document.getElementById("privacy").value,

            body:
                document.getElementById("body").value,

            tags

        }

    });

};

</script>

</body>

</html>

`;
}

function renderTag(tag: string, selected: string[]) {
  const checked = selected?.includes(tag) ? 'checked' : '';
  return `
<label class="tag">
<input
type="checkbox"
value="${tag}"
${checked}>
${tag}
</label>
`;
}

export class BookmarkSeries {}

export class BookmarkPresenter {
  constructor(private app: AppStore) {}
  init() {
    vscode.commands.registerCommand('bookmark.edit', this.present);
  }
  async present(ctx: vscode.ExtensionContext) {
    console.log('Bookmark Present present');
    const panel = vscode.window.createWebviewPanel(
      'estateBookmark',
      'Edit Bookmark',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
      },
    );
    console.log('Bookmark Present present');
    const bookmark = this.app.bookmarks.get('@1785496399347');
    if (!bookmark) return;
    console.log('Bookmark Present present');
    panel.webview.html = getHtml(bookmark);
    console.log('Bookmark Present present');
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'save') {
        console.log('Bookmark Present present onDidReceiveMessage');
        this.app.bookmarks.update(bookmark?.id || '', msg.bookmark);
        console.log('Bookmark Present present update');
        this.app.tree.refresh();
        vscode.window.showInformationMessage('Bookmark saved.');
      }
    });
  }
  // Messages
}
