import * as assert from 'assert';

import * as vscode from 'vscode';

suite('CompletionProvider', () => {
  test('typing [[ at end of file suggests workspace files', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    const offset = text.lastIndexOf('[[') + 2;
    const pos = doc.positionAt(offset);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      pos,
      '[',
    );
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.includes('alpha'), `expected 'alpha' in: ${labels.join(', ')}`);
    assert.ok(labels.includes('beta'), `expected 'beta' in: ${labels.join(', ')}`);
  });
});
