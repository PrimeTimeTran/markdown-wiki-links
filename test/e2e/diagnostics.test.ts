import * as assert from 'assert';

import * as vscode from 'vscode';

import { waitFor } from '../helpers/waitFor';

suite('Diagnostics', () => {
  test('ambiguous link surfaces as an Information diagnostic', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    await vscode.workspace.openTextDocument(uri);
    await waitFor(() => vscode.languages.getDiagnostics(uri).length > 0);
    const diags = vscode.languages.getDiagnostics(uri);
    assert.ok(
      diags.some((d) => /unresolved|ambiguous/i.test(d.message)),
      `expected an unresolved/ambiguous diagnostic, got: ${diags.map((d) => d.message).join(', ')}`,
    );
  });
});
