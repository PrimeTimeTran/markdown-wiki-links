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
export class OwnershipCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const ctx = {
      uri: document.uri.toString(),
      line: range.start.line,
      column: range.start.character,
    };
    return [
      this.action("🔗 Trace ownership lineage", "estate.ownership.lineage", ctx),
      this.action("⬆ Show ancestors", "estate.ast.ancestors", ctx),
      this.action("⬇ Show descendants", "estate.ast.children", ctx),
      this.action("↔ Show siblings", "estate.ast.siblings", ctx),
      this.action("📍 Pin semantic node", "estate.node.pin", ctx),
      this.action("📚 Add to recent", "estate.node.recent", ctx),
      this.action("🔍 Find references", "estate.symbol.references", ctx),
      this.action("🧬 Show value lineage", "estate.value.lineage", ctx),
      this.action("🌳 Show enclosing scope", "estate.scope.show", ctx),
      this.action("📊 Show dependency graph", "estate.graph.open", ctx),
      this.action("📝 Rename semantic symbol", "estate.symbol.rename", ctx),
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
