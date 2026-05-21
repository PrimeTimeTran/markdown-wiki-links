import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Workspace boundary', () => {
  test('no link resolves outside the workspace folder', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'inside.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    for (const l of links) {
      const p = l.target?.fsPath ?? '';
      assert.ok(p === '' || p.startsWith(ws.fsPath), `link escaped workspace: ${p}`);
    }
  });
});
