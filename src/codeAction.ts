import * as path from "node:path";

import * as vscode from "vscode";

export class EstateActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const diagnostic = context.diagnostics.find((d) => d.code === "estate.unresolved-estate-link");

    if (!diagnostic) return [];

    const fileName = this.getFileName(document, diagnostic);
    if (!fileName) return [];

    const paths = this.getTargetPaths(document, fileName);

    const ctx = {
      uri: document.uri.toString(),
      line: range.start.line,
      column: range.start.character,
      endColumn: range.end.character,
    };

    return [
      this.action(`🏡 Create estate link (${paths.estate})`, "estate.bookmark.create", {
        ...ctx,
        targetPath: paths.estate,
      }),
      this.action(`💼 Create workspace link (${paths.workspace})`, "estate.bookmark.create", {
        ...ctx,
        targetPath: paths.workspace,
      }),
      this.action(`💼 Create sibling link (${paths.sibling})`, "estate.bookmark.create", {
        ...ctx,
        targetPath: paths.sibling,
      }),
      this.action("🔗 Link from estate", "estate.bookmark.create", ctx),
    ];
  }

  private getFileName(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): string | undefined {
    const raw = document.getText(diagnostic.range);

    const target = raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();

    if (!target) return undefined;

    return `${target.toLowerCase().replace(/\s+/g, "-")}.md`;
  }

  private getTargetPaths(document: vscode.TextDocument, fileName: string) {
    const estate = path.join(process.env.HOME ?? "", ".estate", fileName);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

    const workspace = workspaceFolder ? path.join(workspaceFolder.uri.fsPath, fileName) : undefined;

    const sibling = path.join(path.dirname(document.uri.fsPath), fileName);

    return {
      estate,
      workspace,
      sibling,
    };
  }

  private action(title: string, command: string, ctx: Record<string, unknown>): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);

    action.command = {
      command,
      title,
      arguments: [ctx],
    };

    return action;
  }
}
