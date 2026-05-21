import * as fs from 'fs/promises';
import * as fsSync from 'fs';

import * as vscode from 'vscode';

/**
 * Fast prefilter. Does NOT resolve symlinks — use only for display logic, never as a security check.
 * Security-critical hot paths must use isInsideWorkspaceReal (async) or isInsideWorkspaceRealSync.
 */
export function isInsideWorkspaceSync(uri: vscode.Uri): boolean {
  return !!vscode.workspace.getWorkspaceFolder(uri);
}

export async function isInsideWorkspaceReal(uri: vscode.Uri): Promise<boolean> {
  try {
    const real = await fs.realpath(uri.fsPath);
    return !!vscode.workspace.getWorkspaceFolder(vscode.Uri.file(real));
  } catch {
    return false;
  }
}

export function isInsideWorkspaceRealSync(uri: vscode.Uri): boolean {
  try {
    const real = fsSync.realpathSync(uri.fsPath);
    return !!vscode.workspace.getWorkspaceFolder(vscode.Uri.file(real));
  } catch {
    return false;
  }
}
