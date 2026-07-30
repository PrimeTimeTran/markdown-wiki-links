import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { EstateContext, EstateFlag } from './estate';

export interface Bookmark {
  type?: string;
  description?: string;
  context?: string;
  label?: string;
  code?: string;
  repo?: string;
  commit?: string;
  scope?: string;
  privacy?: string;
  body?: string;
  updatedAt?: string;
  createdAt?: string;
}
export interface BookmarkStoreType {
  load(path: string): void;
  save(): void;
  get(id: string): Bookmark | undefined;
  create(ctx: EstateContext, opts: CreateBookmarkOptions): Bookmark;
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

  constructor(private roots: string[] = []) {}
  init(): void {
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
  static fromPath(filePath: string): BookmarkStore {
    const store = new BookmarkStore();
    store.loadFsPath(filePath);
    return store;
  }
  loadFsPath(filePath: string): void {
    const estates = this.findEstatesFs(filePath);
    for (const estate of estates) {
      this.loadRegistry(path.join(estate, 'bookmark.json'));
    }

    // for (const flag of flags) {
    //   this.registerFlags();
    // }
  }
  save() {
    // TODO
  }
  get(id: string) {
    return this.items.get(id);
  }
  has(id: string) {
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
  create(ctx: EstateContext, opts: CreateBookmarkOptions): Bookmark {
    return {
      label: opts.label,
      description: opts.description,
      privacy: opts.privacy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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
    const flags: EstateFlag[] = [
      {
        id: '@save',
        label: 'Save',
        description: 'Save',
        scope: 'language',
        action: 'wiki.click',
      },
      {
        id: '@capture',
        label: 'Capture',
        description: 'Capture',
        scope: 'language',
        action: 'wiki.click',
      },
      {
        id: '@note',
        label: 'Note',
        description: 'Note...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@fold',
        label: 'Fold',
        description: 'Fold....',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@preserve',
        label: 'Preserve',
        description: 'Preserve...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@option',
        label: 'Option',
        description: 'Option...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@inline',
        label: 'Inline',
        description: 'Inline...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@context',
        label: 'Option',
        description: 'Option...',
        scope: 'language',
        action: 'ui.openInNewEditorGroup',
      },
      {
        id: '@connected',
        label: 'Connected',
        description: 'Connected...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@branch',
        label: 'Branch',
        description: 'Branch...',
        scope: 'language',
        action: 'wiki.branch',
      },
      {
        id: '@hoverable',
        label: 'Hoverable',
        description: 'Hoverable...',
        scope: 'language',
        action: 'wiki.hoverable',
      },
      {
        id: '@pinnable',
        label: 'Pinnable',
        description: 'Pinnable...',
        scope: 'language',
        action: 'ui.pinnable',
      },
      {
        id: '@pick',
        label: 'Pick',
        description: 'Pick...',
        scope: 'language',
        action: 'wiki.ui.pick',
      },
    ];
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
      { id: '1', label: 'save', description: 'hi', scope: 'language', action: 'wiki.click' },
    ];
    return flags;
  }
  private resolveEstate(): string | undefined {
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
  id: string;
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
    console.log(`Flag: ${match}`);
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
