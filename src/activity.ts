import * as vscode from "vscode";

import { Anchor } from "./adapters/anchorService";
import { AppStore } from "./app";
import { EstateFocus } from "./estate";
// Right now store the cursor here.
// - I have other ideas on how this could be used in compostion with event to do more interesting things.
// Current user context.
// Always changing as the user navigates.
// export interface Activity {
//   uri?: vscode.Uri;
//   file?: string;
//   cursor?: vscode.Position;
//   line?: number;
//   lineText?: string;
//   selection?: vscode.Selection;
//   scope?: ScopeInfo;
//   mode?: string;
//   updatedAt: number;
// }

export type AppActivity = AnchorActivity | AnalysisActivity | EditorActivity;
// CRUD anchors
// Render decorations on click of a new editor
export interface AnchorActivity {
  type: "anchor";
  anchor: Anchor;
  editor?: vscode.TextEditor;
}
export interface AnalysisActivity {
  type: "analysis";
  editor: EditorActivity;
  lines: number[];
}

export interface EditorActivity {
  type: "editor";
  snapshot: EditorSnapshot;
  editor: vscode.TextEditor;
  scope: ScopeInfo;
  updatedAt: number;
}

export interface Activity {
  editor: EditorActivity;
  scope?: ScopeInfo;
  focus?: EstateFocus;
  updatedAt: number;
}
export interface EditorSnapshot {
  uri: vscode.Uri;
  cursor: vscode.Position;
  selection: vscode.Selection;
  line: number;
  column: number;
  displayColumn: number;
  lineText: string;
  languageId: string;
  fileName: string;
  scope: ScopeInfo;
}

// export type AppActivity =
//   | {
//       type: 'anchor';
//       anchor: Anchor;
//       editor?: vscode.TextEditor;
//     }
//   | {
//       type: 'analysis';
//       editor: vscode.TextEditor;
//       lines: number[];
//     }
//   | {
//       type: 'editor';
//       editor: vscode.TextEditor;
//     }
//   | Activity;

// export interface EditorActivity {
//   uri: vscode.Uri;

//   // where the user is
//   cursor: vscode.Position;
//   selection: vscode.Selection;

//   // immediate text context
//   line: number;
//   lineText: string;
//   column: number;
//   displayColumn: number;

//   // file context
//   languageId: string;
//   fileName: string;

//   // semantic context
//   scope?: ScopeInfo;
// }
export interface ScopeInfo {
  variant: string;
  name?: string;
  kind: "heading" | "codeblock" | "list" | "paragraph";
  startLine: number;
  endLine: number;
  range?: vscode.Range;
  text: string;
}
export interface ActivityStore<T = unknown> {
  current(): T | undefined;
  subscribe(listener: (activity: T) => void): vscode.Disposable;
  emit(activity: T): void;
  clear(): void;
  init(context: vscode.ExtensionContext): void;
}
export class ActivityStore<T = unknown> implements ActivityStore<T> {
  private listeners = new Set<(activity: T) => void>();
  private activity?: T;
  constructor(private app: AppStore) {}
  init(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor) return;
        // 1. How do i properly let it know when i go between othr panels?
        this.app.state.focushistory.push("editor");
        console.log("[Activity].onDidChangeActiveTextEditor for ownership feature");
        const hasAnchor = editor ? this.app.anchors.has(editor.document.uri.fsPath) : false;
        console.log("[Activity].checkingAnchor", hasAnchor);
        // await vscode.commands.executeCommand("setContext", "estate.hasAnchor", hasAnchor);
      }),
    );
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        console.log("[Activity].onDidChangeTextEditorSelection click!");
        this.update(event.textEditor);
      }),
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          console.log("[Activity].onDidChangeTextDocument no active editor");
          return;
        }
        if (editor.document.uri.toString() !== event.document.uri.toString()) {
          return;
        }
        console.log("[Activity].onDidChangeTextDocument edit! ");
        this.update(editor);
      }),
    );
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.update(editor);
    }
  }
  private update(editor: vscode.TextEditor): void {
    const document = editor.document;
    const position = editor.selection.active;

    const range = new vscode.Range(
      position.line,
      position.character,
      position.line,
      position.character,
    );

    const scope = captureScope(document, range);

    const activity: EditorActivity = {
      type: "editor",
      editor: editor,
      snapshot: {
        uri: document.uri,
        cursor: position,
        selection: editor.selection,
        line: position.line,
        column: position.character,
        displayColumn: position.character + 1,
        lineText: document.lineAt(position.line).text,
        languageId: document.languageId,
        fileName: document.fileName,
        scope: scope as ScopeInfo,
      },
      scope: scope as ScopeInfo,
      updatedAt: Date.now(),
    };

    this.app.activity.emit(activity);
  }

  current(): T | undefined {
    return this.activity;
  }

  emit(activity: T) {
    this.activity = activity;
    for (const listener of this.listeners) {
      listener(activity);
    }
  }

  subscribe(listener: (activity: T) => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => {
      this.listeners.delete(listener);
    });
  }

  clear() {
    this.activity = undefined;
  }

  // Want to share this so it's left deliberately half baked
  selectionScope(editor: vscode.TextEditor) {
    const selection = editor.selection;
    // This felt right but isnt fow labeling entire files for flow
    // if (selection.isEmpty) {
    //   vscode.window.showWarningMessage('Select something to anchor first');
    //   return;
    // }
    const document = editor.document;
    const selectedText = document.getText(selection);
    const anchor = {
      scope: "source.selection",
      uri: document.uri,
      selection,
      body: selectedText,
      code: selectedText,
      context: selectedText,
      source: {
        uri: document.uri.fsPath,
        startLine: selection.start.line,
        endLine: selection.end.line,
        startCharacter: selection.start.character,
        endCharacter: selection.end.character,
        languageId: document.languageId,
      },
    };
    return anchor;
  }
}
// export interface ScopeInfo {
//   variant: string;
//   name?: string;
//   kind: 'heading' | 'codeblock' | 'list' | 'paragraph';
//   startLine: number;
//   endLine: number;
//   text: string;
// }
export function captureScope(
  document: vscode.TextDocument,
  range: vscode.Range,
): ScopeInfo | undefined {
  const line = range.start.line;
  const maxLines = document.lineCount;
  let safeLineNumber = line;
  if (safeLineNumber < 0 || safeLineNumber >= document.lineCount) {
    return undefined;
  }
  if (insideCodeFence(document, range.start.line)) {
    return captureCodeFence(document, range.start.line);
  }
  if (isMarkdownHeading(document, range.start.line)) {
    return captureHeading(document, range.start.line);
  }
  return {
    range,
    kind: "heading",
    variant: "unknown",
    startLine: line,
    endLine: line,
    text: document.lineAt(line).text,
  };
}
export function captureHeading(document: vscode.TextDocument, startLine: number): ScopeInfo {
  const startText = document.lineAt(startLine).text;
  const level = getHeadingLevel(startText) ?? 1;

  //   console.log('CAPTURE HEADING', {
  //     startLine,
  //     startText,
  //     level,
  //   });

  let endLine = document.lineCount - 1;
  const maxLines = document.lineCount;
  let safeLineNumber = endLine;
  //   for (let i = startLine + 1; i < document.lineCount; i++) {
  //     const text = document.lineAt(i).text;
  //     const nextLevel = getHeadingLevel(text);

  //     if (nextLevel !== undefined) {
  //       endLine = i - 1;
  //       break;
  //     }
  //   }
  for (let i = startLine + 1; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const nextLevel = getHeadingLevel(text);

    // if (nextLevel !== undefined) {
    //   console.log('FOUND HEADING', {
    //     line: i,
    //     text,
    //     nextLevel,
    //     currentLevel: level,
    //     closes: nextLevel <= level,
    //   });
    // }

    if (nextLevel !== undefined && nextLevel <= level) {
      safeLineNumber = i - 1;
      break;
    }
  }

  //   console.log('SCOPE RESULT', {
  //     startLine,
  //     endLine,
  //     lines: endLine - startLine + 1,
  //   });

  return {
    variant: `heading-${level}`,
    kind: "heading",
    name: startText,
    startLine,
    endLine,
    text: document.getText(
      new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, document.lineAt(endLine).text.length),
      ),
    ),
  };
}
export function captureCodeFence(document: vscode.TextDocument, line: number): ScopeInfo {
  let start = line;
  while (start >= 0) {
    if (/^\s*```/.test(document.lineAt(start).text)) {
      break;
    }
    start--;
  }
  let end = start;
  for (let i = start + 1; i < document.lineCount; i++) {
    if (/^\s*```/.test(document.lineAt(i).text)) {
      end = i;
      break;
    }
  }
  const header = document.lineAt(start).text;
  const variant = header.match(/^```([^\s@]+)/)?.[1] ?? "text";
  const text = document.getText(new vscode.Range(start, 0, end, document.lineAt(end).text.length));
  return {
    variant,
    kind: "codeblock",
    startLine: start,
    endLine: end,
    text,
  };
}
export function insideCodeFence(document: vscode.TextDocument, line: number): boolean {
  let open = false;
  for (let i = 0; i <= line; i++) {
    if (/^\s*```/.test(document.lineAt(i).text)) {
      open = !open;
    }
  }
  return open;
}
export function isMarkdownHeading(document: vscode.TextDocument, line: number): boolean {
  return /^\s*#{1,6}\s/.test(document.lineAt(line).text);
}
export function getHeadingLevel(text: string): number | undefined {
  const match = text.match(/^(#{1,6})(?:\s|$)/);
  if (!match) {
    return undefined;
  }
  return match[1].length;
}
// export function captureHeading(document: vscode.TextDocument, line: number): ScopeInfo {
//   const start = line;
//   const first = document.lineAt(line).text;
//   const level = first.match(/^(\s*#+)/)![1].trim().length;
//   const name = first.replace(/^(\s*#+)\s*/, '');
//   let end = document.lineCount - 1;
//   for (let i = start + 1; i < document.lineCount; i++) {
//     const text = document.lineAt(i).text;
//     const m = text.match(/^(\s*#+)\s/);
//     if (!m) {
//       continue;
//     }
//     const nextLevel = m[1].trim().length;
//     if (nextLevel <= level) {
//       end = i - 1;
//       break;
//     }
//   }
//   const text = document.getText(new vscode.Range(start, 0, end, document.lineAt(end).text.length));
//   return {
//     variant: 'markdown.heading',
//     kind: 'heading',
//     name,
//     startLine: start,
//     endLine: end,
//     text,
//   };
// }

// 1. Create 2nd field to index by file
// export class AnchorStore implements AnchorStoreType {
//   private items = new Map<string, Anchor>();
//   private fileIndex = new Map<string, Anchor[]>();
//   1. Add to items and fileIndex when creating
//   2. Use fileIndex for embedded(or over all, so we dont have to do "row by row scan")

// 2. Create register function for this logic, adding to that list
//   register(id: string, b: Anchor): void {
//     let uri = b.uri.toString();
//     let index = this.fileIndex.get(uri) || [];
//     index.push(b);
//     this.fileIndex.set(uri, index);
//     this.items.set(id, b);
//   }

// 3. Ensure we use it in create.
//   create(ctx: EstateContext, opts: CreateAnchorOptions, anchor: Partial<Anchor>): Anchor {
//     const now = new Date().toISOString();
//     let id = randomUUID();
//     let b = new Anchor(id, {
//       id,
//       tags: [],
//         // ...
//     });
//     this.register(id, b)
//     return b;
//   }

// 4. Add a findInIndex
//   inFile(b: Anchor, file: vscode.Uri) {
//     return file == this.getUri(b);
//   }
//   find(text: string, line: number): AnchorOccurrence[] | FlagOccurrence[] {
//     return [...findAnchors(text, this, line), ...findFlags(text, this, line)];
//   }
//   findInFile(file: vscode.Uri): Anchor[] {
//     return this.list().filter((b) => this.inFile(b, file));
//   }
//   // Now this one returns...
//   findInIndex(file: vscode.Uri) {
//     return this.fileIndex.get(file.toString());
//   }

// 5. Merge with this guy
// Cause I know there's a method somewhere that were going row by row and rendering anchors so we ned them in order
// export function findAnchors(
//   text: string,
//   store: AnchorStore,
//   line: number,
// ): AnchorOccurrence[] {
//   const results: AnchorOccurrence[] = [];
//   const regex = /@[A-Za-z0-9_-]+/g;
//   for (const match of text.matchAll(regex)) {
//     const id = match[0];
//     // "if match is in store or embedded store contains an entry for this file and line..."
//     // It's like two sides of the same coin.
//     if (!store.has(id)) {
//       continue;
//     }
//     results.push({
//       id,
//       line,
//       start: match.index!,
//       end: match.index! + id.length,
//     });
//   }

//   return results;
// }

export interface Activity {
  editor: EditorActivity;
  leader?: boolean;
  updatedAt: number;
}
