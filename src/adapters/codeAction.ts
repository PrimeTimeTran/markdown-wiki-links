import * as vscode from 'vscode';
// export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
//   provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
//     const action = new vscode.CodeAction(
//       '🔍 Show ownership lineage',
//       vscode.CodeActionKind.Refactor,
//     );
//     action.command = {
//       command: 'estate.showOwnership',
//       title: 'Show ownership lineage',
//       arguments: [document.uri.toString(), range.start.line, range.start.character],
//     };
//     return [action];
//   }
// }
export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const ctx = {
      uri: document.uri.toString(),
      line: range.start.line,
      column: range.start.character,
    };
    // console.log('CODE ACTION REQUEST', document.fileName, range.start.line);
    return [
      this.action('🔗 Trace ownership lineage', 'estate.ownership.lineage', ctx),
      this.action('⬆ Show ancestors', 'estate.ast.ancestors', ctx),
      this.action('⬇ Show descendants', 'estate.ast.children', ctx),
      this.action('↔ Show siblings', 'estate.ast.siblings', ctx),
      this.action('📍 Pin semantic node', 'estate.node.pin', ctx),
      this.action('📚 Add to recent', 'estate.node.recent', ctx),
      this.action('🔍 Find references', 'estate.symbol.references', ctx),
      this.action('🧬 Show value lineage', 'estate.value.lineage', ctx),
      this.action('🌳 Show enclosing scope', 'estate.scope.show', ctx),
      this.action('📊 Show dependency graph', 'estate.graph.open', ctx),
      this.action('📝 Rename semantic symbol', 'estate.symbol.rename', ctx),
    ];
  }
  private action(title: string, command: string, ctx: any): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.Refactor);
    action.command = {
      command,
      title,
      arguments: [ctx],
    };
    return action;
  }
}
// export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
//   provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
//     console.log('CODE ACTION REQUEST', document.fileName, range.start.line);
//     const action = new vscode.CodeAction('TEST: Show Ownership', vscode.CodeActionKind.Empty);
//     action.command = {
//       command: 'estate.showOwnership',
//       title: 'TEST: Show Ownership',
//       arguments: [document.uri.toString(), range.start.line, range.start.character],
//     };
//     console.log('RETURNING ACTION', action.command);
//     return [action];
//   }
// }
// export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
//   provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
//     const action = new vscode.CodeAction('TEST: Show Ownership', vscode.CodeActionKind.Empty);
//     action.isPreferred = true;
//     action.command = {
//       command: 'estate.testOwnershipAction',
//       title: 'TEST: Show Ownership',
//       arguments: [document.uri.toString(), range.start.line, range.start.character],
//     };
//     return [action];
//   }
// }
