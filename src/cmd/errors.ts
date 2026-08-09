import * as vscode from "vscode";

import { CMD } from "../../generated/cmd";
import { CommandId } from "./command-schema";

type DiagnosticId = string;

export type Diagnostic = {
  code: DiagnosticId;
  title: string;
  description: string;
  level: vscode.DiagnosticSeverity;
};

export type ActionDefinition = {
  title: string;
  description: string;
  command: CommandId;
  arguments: unknown[];
  context?: ActionContext;
};

export type Action = {
  diagnostic?: Diagnostic;
  action: ActionDefinition;
};

export interface ActionContext {
  document: vscode.TextDocument;
  range: vscode.Range;
  diagnostic: vscode.Diagnostic;
}

export type ErrorDefinition = {
  message: string;
  description?: string;
  level: vscode.DiagnosticSeverity;
};

export type ErrorContext = {
  document: vscode.TextDocument;
  range: vscode.Range;
  diagnostic: vscode.Diagnostic;
  definition: ErrorDefinition;
};

export type ActionHandler = ErrorContext;

export const actions = {
  estate: {
    "estate.unresolved-estate-link": {
      title: "Create an estate link",
      description: "Unresolved estate link",
      command: CMD.estate.bookmark.create,
      arguments: [],
    },
    "estate.unresolved-wikilink": {
      title: "Create an wikilink",
      description: "Unresolved estate link",
      command: CMD.estate.bookmark.create,
      arguments: [],
    },
  },
} satisfies {
  estate: Record<DiagnosticId, ActionDefinition>;
};

export type EstateErrorCode = keyof typeof actions.estate;

export function getErrorDefinition(code: EstateErrorCode) {
  return actions.estate[code];
}

export function isEstateErrorCode(value: string): value is EstateErrorCode {
  return Object.hasOwn(actions.estate, value);
}
export function diagnosticCode(diagnostic: vscode.Diagnostic): EstateErrorCode | undefined {
  const code = diagnostic.code;
  if (typeof code !== "string") {
    return undefined;
  }
  return isEstateErrorCode(code) ? code : undefined;
}
