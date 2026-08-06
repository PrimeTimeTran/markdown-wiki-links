import * as vscode from "vscode";

export class EstateActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const hasEstateDiagnostic = context.diagnostics.some(
      (d) => d.code === "estate.unresolved-estate-link",
    );

    if (!hasEstateDiagnostic) {
      return [];
    }

    const ctx = {
      uri: document.uri.toString(),
      line: range.start.line,
      column: range.start.character,
    };

    return [
      this.action("🏡 Create estate link ()", "estate.bookmark.create", ctx),
      this.action("💼 Create workspace link", "estate.bookmark.create", ctx),
      this.action("🔗 Link from estate ", "estate.bookmark.create", ctx),
    ];
  }
  private action(title: string, command: string, ctx: any): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.command = {
      command,
      title,
      arguments: [ctx],
    };
    return action;
  }
}
