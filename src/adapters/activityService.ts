import * as vscode from 'vscode';
import { EstateFocus } from './estate';

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
export interface Activity {
  editor: EditorActivity;
  scope?: ScopeInfo;
  focus?: EstateFocus;
  updatedAt: number;
}
export interface EditorActivity {
  uri: vscode.Uri;

  // where the user is
  cursor: vscode.Position;
  selection: vscode.Selection;

  // immediate text context
  line: number;
  lineText: string;

  // file context
  languageId: string;
  fileName: string;

  // semantic context
  scope?: ScopeInfo;
}
export interface ScopeInfo {
  variant: string;
  name?: string;

  kind: 'heading' | 'codeblock' | 'list' | 'paragraph';

  startLine: number;
  endLine: number;

  range?: vscode.Range;

  text: string;
}
export interface ActivityStoreType {
  current(): Activity | undefined;
  subscribe(listener: (activity: Activity) => void): vscode.Disposable;
  init(context: vscode.ExtensionContext): void;
}
export class ActivityStore implements ActivityStoreType {
  private activity?: Activity;
  private listeners = new Set<(a: Activity) => void>();
  init(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.update(event.textEditor);
      }),
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        if (editor.document.uri.toString() !== event.document.uri.toString()) {
          return;
        }
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

    this.activity = {
      editor: {
        uri: document.uri,
        cursor: position,
        selection: editor.selection,
        line: position.line,
        lineText: document.lineAt(position.line).text,
        languageId: document.languageId,
        fileName: document.fileName,
        scope,
      },
      scope,
      updatedAt: Date.now(),
    };

    for (const listener of this.listeners) {
      listener(this.activity);
    }
  }
  current(): Activity | undefined {
    return this.activity;
  }
  subscribe(listener: (activity: Activity) => void): vscode.Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
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
  //   console.log('CAPTURE SCOPE INPUT', {
  //     line: range.start.line,
  //     text: document.lineAt(range.start.line).text,
  //   });
  if (line < 0 || line >= document.lineCount) {
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
    kind: 'heading',
    variant: 'unknown',
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
      endLine = i - 1;
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
    kind: 'heading',
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
  const variant = header.match(/^```([^\s@]+)/)?.[1] ?? 'text';
  const text = document.getText(new vscode.Range(start, 0, end, document.lineAt(end).text.length));
  return {
    variant,
    kind: 'codeblock',
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
