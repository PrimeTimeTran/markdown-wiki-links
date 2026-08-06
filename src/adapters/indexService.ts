import * as fs from "node:fs";
import * as path from "path";

import * as vscode from "vscode";

import { buildExcludeGlob } from "../core/pathFilter";
import { IndexSnapshot, createSnapshot } from "../core/resolver/resolveTarget";
import { ParsedRef } from "../core/types";
import { EmbedResolved, LinkResolved } from "../markdownItPlugin/wikiRule";
import { IMAGE_RE } from "./hoverProvider";

const GLOB = "**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg,rs,ts,js,py}";
// The same extension set as GLOB. add() must enforce it directly: rename events are not
// filtered by the watcher glob, so without this a renamed folder (or a .md renamed to .txt)
// would be inserted into the index as a link target.
const INDEXABLE_RE = /\.(rs|js|ts|py|md|markdown|png|jpe?g|gif|webp|svg)$/i;

const DEFAULT_EXCLUDED_FOLDERS = [
  ".git",
  "node_modules",
  "target",
  ".hg",
  ".svn",
  ".bzr",
  "bower_components",
];

// Soft cap on indexed files. Each entry is three short strings plus object/Map overhead —
// roughly 350-450 bytes — so the 50,000 default costs on the order of 20 MB of heap.
const DEFAULT_INDEX_MAX_FILES = 50000;

export class IndexService {
  public root: string;
  private readonly estateRegistry: EstateRegistry;
  private readonly workspaceRegistry: WorkspaceRegistry;
  public readonly resolver: WikiResolver;
  // private entries = new Map<string, IndexEntry>();
  private watcher?: vscode.FileSystemWatcher;
  private listeners: vscode.Disposable[] = [];
  // Snapshots (entries copy + resolver lookup) are O(index) to build, and providers ask for
  // one on every keystroke/render — cache per root and invalidate by generation, so the
  // cost is paid once per index mutation, not once per call. Bounded: one entry per root.
  private generation = 0;
  private snapCache = new Map<string, { generation: number; snap: IndexSnapshot }>();
  constructor() {
    this.root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    if (!this.root) {
      throw new Error("No workspace folder");
    }
    this.workspaceRegistry = new WorkspaceRegistry(this.root);
    this.estateRegistry = new EstateRegistry("/Users/future/.estate");
    this.resolver = new WikiResolver([this.workspaceRegistry, this.estateRegistry]);
  }
  getResolver() {
    return this.resolver;
  }
  async initialize(): Promise<void> {
    await this.refresh();
    this.watcher = vscode.workspace.createFileSystemWatcher(GLOB);
    this.listeners.push(
      this.watcher.onDidCreate((u) => this.add(u)),
      this.watcher.onDidDelete((u) => this.remove(u)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.onDocumentChanged(e);
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("wikiLinks.index.excludeFolders")) {
          this.refresh();
        }
      }),
    );
  }
  private async scan(): Promise<void> {
    const exclude = buildExcludeGlob(excludedFolders());
    const cap = indexMaxFiles();
    const found = await vscode.workspace.findFiles(GLOB, exclude);
    let added = false;
    for (const uri of found.slice(0, cap)) {
      if (this.workspaceRegistry.add(uri)) {
        added = true;
      }
    }
    if (added) {
      this.generation++;
      this.snapCache.clear();
    }
  }
  snapshotFor(fromFsPath: string): IndexSnapshot {
    const cached = this.snapCache.get(this.root);
    if (cached && cached.generation === this.generation) {
      return cached.snap;
    }
    const entries = [...this.workspaceRegistry.all(), ...this.estateRegistry.all()]
      .filter((e) => e.kind === "file")
      .map((e) => ({
        fsPath: e.uri.fsPath,
        relPath: path.relative(this.root, e.uri.fsPath),
        baseNoExt: e.label,
      }));
    const snap = createSnapshot(entries, this.root);
    this.snapCache.set(this.root, {
      generation: this.generation,
      snap,
    });

    return snap;
  }
  async refresh(): Promise<void> {
    this.generation++;
    this.snapCache.clear();
    for (const registry of this.resolver.registries()) {
      await registry.refresh?.();
    }
  }
  dispose(): void {
    this.watcher?.dispose();
    for (const l of this.listeners) l.dispose();
  }
  resolve(label: string): EstateEntry | undefined {
    const result = this.resolver.resolve(label);
    if (!result) {
      vscode.window.showInformationMessage(
        `Estate: "${label}" not found. Checked workspace registry.`,
      );
    }
    return result;
  }
  private add(u: vscode.Uri): void {
    const added = this.workspaceRegistry.add(u);
    if (added) {
      this.generation++;
      this.snapCache.clear();
    }
  }
  private onDocumentChanged(event: vscode.TextDocumentChangeEvent) {
    const doc = event.document;
    if (doc.languageId !== "markdown") {
      return;
    }
    // optional: only inspect the changed lines
    for (const change of event.contentChanges) {
      const text = change.text;
      const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of matches) {
        const label = match[1];
        const entry = this.resolver.resolve(label);
        if (!entry) {
          this.reportMissing(`Estate: "${label}" not found. Checked workspace registry.`);
          // vscode.window.showInformationMessage(
          //   `Estate: "${label}" not found. Checked workspace registry.`,
          // );
        }
      }
    }
  }
  private missingTimer?: NodeJS.Timeout;
  private reportMissing(label: string) {
    clearTimeout(this.missingTimer);
    this.missingTimer = setTimeout(() => {
      vscode.window.showInformationMessage(`Estate: "${label}" not found.`);
    }, 500);
  }
  private remove(u: vscode.Uri): void {
    if (this.workspaceRegistry.remove(u)) {
      this.generation++;
      this.snapCache.clear();
    }
  }
}

function indexMaxFiles(): number {
  const configured = vscode.workspace
    .getConfiguration("wikiLinks")
    .get<number>("indexMaxFiles", DEFAULT_INDEX_MAX_FILES);
  return typeof configured === "number" && configured > 0 ? configured : DEFAULT_INDEX_MAX_FILES;
}

export function excludedFolders(): string[] {
  const configured = vscode.workspace
    .getConfiguration("wikiLinks")
    .get<string[]>("index.excludeFolders");
  return Array.isArray(configured) ? configured : DEFAULT_EXCLUDED_FOLDERS;
}

// class WorkspaceScanner {
//   async scan(registry: WorkspaceRegistry) {
//     const files = await vscode.workspace.findFiles(GLOB);

//     for (const file of files) {
//       registry.add(createWorkspaceEntry(file));
//     }
//   }
// }

type EstateKind = "file" | "heading" | "block" | "symbol" | "bookmark" | "setting" | "anchor";

export interface EstateEntry {
  id: string;

  /**
   * Primary display name
   */
  label: string;

  /**
   * Alternate names that resolve to this entry
   */
  aliases: string[];

  /**
   * Where it lives
   */
  uri: vscode.Uri;

  matches(query: string): boolean;
  kind: EstateKind;
  linkUri(): vscode.Uri | undefined;
}
class WorkspaceEntry implements EstateEntry {
  readonly id: string;
  readonly aliases: string[];
  constructor(
    id: string,
    readonly fsPath: string,
    readonly relPath: string,
    readonly baseNoExt: string,
    readonly kind: EstateKind,
  ) {
    this.id = id;
    this.aliases = [baseNoExt, relPath, stripMdExt(relPath)];
  }
  get label() {
    return this.baseNoExt;
  }
  get uri() {
    return vscode.Uri.file(this.fsPath);
  }
  matches(query: string) {
    return this.aliases.includes(query);
  }
  linkUri() {
    return this.uri;
  }
}
export class EstateAnchorEntry implements EstateEntry {
  readonly kind: EstateKind = "bookmark";
  readonly aliases: string[];

  constructor(
    readonly anchor: {
      id: string;
      label: string;
      description?: string;
      uri?: string;
      tags?: string[];
      code?: string;
      src?: {
        uri: string;
        startLine: number;
        endLine: number;
        startCharacter: number;
        endCharacter: number;
        languageId: string;
      };
    },
  ) {
    this.aliases = [anchor.label, anchor.id];
  }

  get id() {
    return this.anchor.id;
  }

  get label() {
    return this.anchor.label;
  }

  get uri(): vscode.Uri {
    return vscode.Uri.file(this.anchor.src?.uri ?? "");
  }
  matches(query: string): boolean {
    return this.aliases.includes(query);
  }
  linkUri(): vscode.Uri | undefined {
    if (!this.anchor.src) {
      return undefined;
    }
    return vscode.Uri.file(this.anchor.src.uri).with({
      fragment: `L${this.anchor.src.startLine + 1}`,
    });
  }
}
interface WikiRegistry {
  readonly name: string;
  readonly priority: number;
  all(): Iterable<EstateEntry>;
  refresh?(): Promise<void>;
}
class EstateRegistry implements WikiRegistry {
  readonly name = "estate";
  readonly priority = 100;
  readonly anchorsPath = "/Users/future/.estate/anchors.json";
  private readonly items = new Map<string, EstateEntry>();
  constructor(readonly root: string) {}
  all(): Iterable<EstateEntry> {
    return this.items.values();
  }
  async refresh(): Promise<void> {
    this.items.clear();
    const data = JSON.parse(await fs.promises.readFile(this.anchorsPath, "utf8"));
    for (const anchor of Object.values(data.items)) {
      if (!anchor.tags?.includes("wiki")) continue;
      const entry = new EstateAnchorEntry(anchor);
      this.items.set(entry.id, entry);
    }
  }
}
class WorkspaceRegistry implements WikiRegistry {
  readonly name = "workspace";
  readonly priority = 100;
  private readonly items = new Map<string, WorkspaceEntry>();
  constructor(readonly root: string) {}
  async refresh(): Promise<void> {
    this.items.clear();
    const exclude = buildExcludeGlob(excludedFolders());
    const cap = indexMaxFiles();
    const found = await vscode.workspace.findFiles(GLOB, exclude);
    for (const uri of found.slice(0, cap)) {
      this.add(uri);
    }
  }
  values(): Iterable<WorkspaceEntry> {
    return this.items.values();
  }
  entries(): Iterable<EstateEntry> {
    return this.items.values();
  }
  all(): Iterable<EstateEntry> {
    return this.items.values();
  }
  add(uri: vscode.Uri): WorkspaceEntry | undefined {
    if (!INDEXABLE_RE.test(uri.fsPath)) return;
    const existing = this.items.get(uri.fsPath);
    if (existing) {
      return existing;
    }
    const relPath = path.relative(this.root, uri.fsPath);
    const baseNoExt = stripMdExt(path.basename(uri.fsPath));
    const entry = new WorkspaceEntry(crypto.randomUUID(), uri.fsPath, relPath, baseNoExt, "file");
    this.items.set(uri.fsPath, entry);
    return entry;
  }
  remove(uri: vscode.Uri): boolean {
    return this.items.delete(uri.fsPath);
  }
  clear(): void {
    this.items.clear();
  }
}

export class WikiResolver {
  constructor(private readonly sources: WikiRegistry[]) {
    this.sources.sort((a, b) => b.priority - a.priority);
  }
  registries(): readonly WikiRegistry[] {
    return this.sources;
  }
  *all(): Generator<EstateEntry> {
    for (const registry of this.sources) {
      yield* registry.all();
    }
  }
  resolve(label: string): EstateEntry | undefined {
    for (const registry of this.sources) {
      for (const entry of registry.all()) {
        if (entry.matches(label)) {
          return entry;
        }
      }
    }
    return undefined;
  }

  resolveRelative(target: string, fromFsPath: string): EstateEntry | undefined {
    const normalized = stripMdExt(target.replace(/\\/g, "/")).toLowerCase();
    const fromDir = path.dirname(fromFsPath);

    for (const registry of this.sources) {
      for (const entry of registry.all()) {
        const entryPath = entry.uri.fsPath;

        // Absolute filesystem match
        if (path.normalize(entryPath) === path.normalize(target)) {
          return entry;
        }

        // Relative to current document
        const relative = path.relative(fromDir, entryPath).replace(/\\/g, "/");

        if (stripMdExt(relative).toLowerCase() === normalized) {
          return entry;
        }

        // Workspace-relative fallback
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (workspaceRoot) {
          const workspaceRelative = path.relative(workspaceRoot, entryPath).replace(/\\/g, "/");

          if (stripMdExt(workspaceRelative).toLowerCase() === normalized) {
            return entry;
          }
        }
      }
    }
    return undefined;
  }
  resolveLink(
    ref: Pick<ParsedRef, "target" | "fragment">,
    fromFsPath: string,
  ): EstateEntry | undefined {
    const target = ref.target.split("#")[0].trim();

    const direct = this.resolve(target);

    if (direct) {
      return direct;
    }

    return this.resolveRelative(target, fromFsPath);
  }

  resolveEmbed(target: string, fragment?: string): EmbedResolved | null {
    const entry = this.resolve(target);

    if (!entry) {
      return null;
    }

    if (this.isImage(entry)) {
      return {
        kind: "image",
        src: entry.uri.toString(),
      };
    }

    return {
      kind: "markdown",
      text: fs.readFileSync(entry.uri.fsPath, "utf8"),
      sourcePath: entry.uri.fsPath,
    };
  }

  fileHref(entry: EstateEntry, fragment: string | undefined): string {
    throw new Error("Method not implemented fileHref.");
  }
  private isImage(entry: EstateEntry): boolean {
    return IMAGE_RE.test(entry.uri.fsPath);
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function stripMdExt(name: string): string {
  return name.replace(/\.md$/i, "");
}
