// import * as vscode from 'vscode';

// export async function showOwnershipView() {
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) return;
//   const source = editor.document.uri;
//   const config = vscode.workspace.getConfiguration('editor');
//   const annotationUri = vscode.Uri.parse(`estate://symbols${source.path}`);
//   const doc = await vscode.workspace.openTextDocument(annotationUri);
//   vscode.workspace.getConfiguration('editor', doc.uri);

//   await vscode.window.showTextDocument(doc, {
//     viewColumn: vscode.ViewColumn.Beside,
//     preview: true,
//     preserveFocus: true,
//   });

//     await vscode.commands.executeCommand('estate.showOwnership', annotationUri, {
//       viewColumn: vscode.ViewColumn.Beside,
//       preview: true,
//     });

//   //   await vscode.commands.executeCommand('workbench.action.openEditorAtIndex', 0);

//   //   await vscode.window.showTextDocument(doc, {
//   //     viewColumn: vscode.ViewColumn.Beside,
//   //     preview: true,
//   //   });

//   // context.subscriptions.push(
//   //   vscode.commands.registerCommand('estate.showOwnership', showOwnershipView),
//   // );
// }

// export class OwnershipContentProvider implements vscode.TextDocumentContentProvider {
//   private emitter = new vscode.EventEmitter<vscode.Uri>();
//   readonly onDidChange = this.emitter.event;
//   provideTextDocumentContent(uri: vscode.Uri): string {
//     return ['', 'fn main', '', '  x: String', '', 'foo(x)', ''].join('\n');
//   }
//   refresh(uri?: vscode.Uri) {
//     if (uri) {
//       this.emitter.fire(uri);
//     }
//   }
// }

// export class OwnershipContentProvider implements vscode.TextDocumentContentProvider {
//   private emitter = new vscode.EventEmitter<vscode.Uri>();

//   readonly onDidChange = this.emitter.event;

//   provideTextDocumentContent(uri: vscode.Uri): string {
//     return [
//       '',
//       '        ▲',
//       '        │ owns',
//       '        │',
//       '   x: String',
//       '',
//       '        │ move',
//       '        ▼',
//       '      foo(x)',
//       '',
//       'Symbols: 3',
//       'Moves: 1',
//     ].join('\n');
//   }

//   refresh(uri: vscode.Uri) {
//     this.emitter.fire(uri);
//   }
// }

import * as vscode from 'vscode';

// export async function showOwnershipView() {
//   const editor = vscode.window.activeTextEditor;
//   if (!editor) return;
//   const sourceUri = editor.document.uri;
//   const ownershipUri = vscode.Uri.parse(`estate://ownership${sourceUri.path}`);
//   await vscode.commands.executeCommand('vscode.diff', ownershipUri, sourceUri, 'Ownership');
// }
export async function showOwnershipView() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const sourceUri = editor.document.uri;
  await vscode.commands.executeCommand('workbench.action.navigateLeft');
  const ownershipUri = vscode.Uri.parse(`estate://ownership${sourceUri.path}`);
  await vscode.commands.executeCommand('vscode.diff', ownershipUri, sourceUri, 'Ownership');
  // shrink left group
  //   for (let i = 0; i < 8; i++) {
  //     await vscode.commands.executeCommand('workbench.action.decreaseViewSize');
  //   }
  //   for (let i = 0; i < 10; i++) {
  //     await vscode.commands.executeCommand('workbench.action.decreaseViewSize');
  //   }
  // https://code.visualstudio.com/api/extension-guides/command
  //   vscode.commands.executeCommand('workbench.action.');
}

export class OwnershipContentProvider implements vscode.TextDocumentContentProvider {
  private emitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.emitter.event;

  constructor(private engine: OwnershipEngine) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const sourceUri = vscode.Uri.file(uri.path);

    const sourceDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === sourceUri.toString(),
    );

    if (!sourceDoc) {
      return '';
    }

    const analysis = this.engine.analyze(sourceUri);

    return renderOwnershipColumn(analysis, sourceDoc.lineCount);
  }

  refresh(uri: vscode.Uri) {
    this.emitter.fire(uri);
  }
}

export class OwnershipEngine {
  analyze(uri: vscode.Uri): OwnershipAnalysis {
    const text =
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())?.getText() ??
      '';

    const lines = text.split('\n');

    const events: OwnershipEvent[] = [];

    lines.forEach((line, index) => {
      if (line.includes('String::new')) {
        events.push({
          line: index,
          icon: '🏠',
          label: 'owns String',
          kind: 'owner',
        });
      }

      if (line.includes('(') && line.includes(')')) {
        events.push({
          line: index,
          icon: '→',
          label: 'move candidate',
          kind: 'move',
        });
      }

      if (line.includes('&')) {
        events.push({
          line: index,
          icon: '&',
          label: 'borrow',
          kind: 'borrow',
        });
      }
    });

    return {
      uri,
      events,
    };
  }
}
export function renderOwnershipColumn(
  analysis: OwnershipAnalysis,
  sourceLineCount: number,
): string {
  const rows = Array.from({ length: sourceLineCount }, () => '');

  for (const event of analysis.events) {
    rows[event.line] = `${event.icon ?? ''} ${event.label}`;
  }

  return rows.join('\n');
}

export interface OwnershipEvent {
  line: number;
  icon?: string;
  label: string;
  kind: 'owner' | 'move' | 'borrow' | 'error';
}

export interface OwnershipAnalysis {
  uri: vscode.Uri;
  events: OwnershipEvent[];
}
