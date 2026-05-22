import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Excluded vendor folders', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  test('[[vendored]] does not resolve - the .svn folder is not indexed', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'vendor-ref.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    const vendored = links.find((l) => (l.target?.fsPath ?? '').endsWith('vendored.md'));
    assert.strictEqual(vendored, undefined, 'a link into .svn must not be produced');
  });

  test('completion does not suggest files inside an excluded folder', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    const offset = doc.getText().lastIndexOf('[[') + 2;
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      doc.positionAt(offset),
      '[',
    );
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(
      !labels.includes('vendored'),
      `excluded file leaked into completions: ${labels.join(', ')}`,
    );
  });
});
