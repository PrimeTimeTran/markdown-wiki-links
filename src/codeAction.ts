import * as vscode from "vscode";

import { AppStore } from "./app";
import {
  actions,
  ActionContext,
  diagnosticCode,
  EstateErrorCode,
  ActionDefinition,
} from "./cmd/errors";

type Handler = (actionContext: ActionContext) => ActionDefinition[];

export class EstateActionProvider {
  readonly handlers = new Map<EstateErrorCode, Handler>();

  constructor(private readonly app: AppStore) {
    for (const code of Object.keys(actions.estate) as EstateErrorCode[]) {
      const action = actions.estate[code];
      this.handlers.set(code, (ctx) => this.handle(ctx, action));
    }
  }

  provide(
    document: vscode.TextDocument,
    range: vscode.Range,
    diagnostic: vscode.Diagnostic,
  ): ActionDefinition[] {
    const code = diagnosticCode(diagnostic);
    if (!code) return [];
    const handler = this.handlers.get(code);
    if (!handler) return [];
    return handler({
      document,
      range,
      diagnostic,
    });
  }

  private handle(ctx: ActionContext, action: ActionDefinition): ActionDefinition[] {
    const fileName = this.getFileName(ctx.document, ctx.diagnostic);
    const paths = this.app.getTargetPaths(ctx.document, fileName || "");

    return [
      {
        ...action,
        arguments: [ctx, paths],
      },
    ];
  }

  private getFileName(doc: vscode.TextDocument, diagnostic: vscode.Diagnostic): string | undefined {
    const raw = doc.getText(diagnostic.range);
    const target = raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();
    if (!target) return undefined;
    return `${target.toLowerCase().replace(/\s+/g, "-")}.md`;
  }
}

export class CodeActionAdapter implements vscode.CodeActionProvider {
  constructor(private actions: EstateActionProvider) {}

  provideCodeActions(
    doc: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    return context.diagnostics.flatMap((diagnostic) =>
      this.actions.provide(doc, range, diagnostic).map((action: ActionDefinition) => {
        const result = new vscode.CodeAction(
          `$(trash) ${action.title}: ${action?.arguments[1].estate}`,
          vscode.CodeActionKind.QuickFix,
        );
        result.command = {
          title: `${action.title}:`,
          command: action.command,
          arguments: action.arguments,
        };

        return result;
      }),
    );
  }
}
export class CodeLensAdapter implements vscode.CodeLensProvider {
  constructor(private actions: EstateActionProvider) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);

    return diagnostics.flatMap((diagnostic) =>
      this.actions.provide(document, diagnostic.range, diagnostic).map(
        (action) =>
          new vscode.CodeLens(diagnostic.range, {
            title: `${action.title}`,
            command: action.command,
            arguments: action.arguments,
          }),
      ),
    );
  }
}
