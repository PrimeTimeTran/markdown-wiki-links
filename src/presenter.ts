import * as vscode from 'vscode';
import { AnchorSeries } from './adapters/anchorService';

export interface Presenter<T> {
  present(value: T): Thenable<void>;

  // Notification
  info(message: string): Thenable<void>;
  warning(message: string): Thenable<void>;
  error(message: string): Thenable<void>;

  // Pickers
  quickPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ): Thenable<T | undefined>;

  multiPick<T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ): Thenable<T[] | undefined>;

  input(options?: vscode.InputBoxOptions): Thenable<string | undefined>;

  // Editors
  configure(anchor: T): Thenable<void>;
  open(anchor: T): Thenable<void>;
  openDiff(left: vscode.Uri, right: vscode.Uri): Thenable<void>;

  // Panels
  showEditor(anchor: T): Thenable<void>;
  showSeries(series: AnchorSeries): Thenable<void>;

  // Tree / Explorer
  reveal(id: string): Thenable<void>;
  refresh(): void;

  // Navigation
  openLocation(location: vscode.Location): Thenable<void>;
}

// export class AnchorEditorPresenter implements Presenter<Anchor> {}
// export class SeriesPresenter implements Presenter<AnchorSeries> {
//   async present(series: AnchorSeries) {}
// }
// export class SemanticGraph {}
// export class GraphPresenter implements Presenter<SemanticGraph> {
//   async present(graph: SemanticGraph) {}
// }

export class Global {
  constructor() {}
  snippetMaker(ctx: vscode.ExtensionContext) {
    vscode.commands.registerCommand('estate.snippet-maker', async () => {
      const language = await this.pickSnippetLanguage();
      if (!language) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: language.id,
        content: language.template,
      });
      const editor = await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('editor.action.formatDocument');
    });
  }
  private async pickSnippetLanguage() {
    const items = [
      {
        label: 'HTML',
        id: 'html',
        template: `<!doctype html>
<html>
<head>
  <title>Snippet</title>
</head>
<body>

</body>
</html>`,
      },

      {
        label: 'JavaScript',
        id: 'javascript',
        template: `function main() {

}

main();`,
      },

      {
        label: 'CSS',
        id: 'css',
        template: `.container {

}`,
      },

      {
        label: 'JSON',
        id: 'json',
        template: `{
  
}`,
      },
    ];

    return vscode.window.showQuickPick(items, {
      placeHolder: 'Choose snippet type',
    });
  }
  addStatusBar() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    item.text = '$(symbol-class) Ownership 3/7';
    item.command = 'estate.showFlow';
    item.show();
  }
}
