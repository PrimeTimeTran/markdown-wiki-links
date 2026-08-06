import * as vscode from "vscode";

import { Anchor } from "./anchor";
import { AppStore } from "./app";
import { EstateFocus } from "./estate";
// Right now store the cursor here.
// - I have other ideas on how this could be used in compostion with event to do more interesting things.
// Current user context.
// Always changing as the user navigates.

export type AppActivity = AnchorActivity | AnalysisActivity | EditorActivity;
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

export interface ScopeInfo {
  variant: string;
  name?: string;
  kind: "heading" | "codeblock" | "list" | "paragraph";
  startLine: number;
  endLine: number;
  range?: vscode.Range;
  text: string;
}
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging
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
export interface Activity {
  editor: EditorActivity;
  leader?: boolean;
  updatedAt: number;
}
