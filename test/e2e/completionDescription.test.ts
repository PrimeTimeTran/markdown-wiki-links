import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Completion descriptions', () => {
  test('duplicated file names show their folder beside every matching item', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    // index.md line 0 is "- [[dup]]"; trigger completion just inside the first [[.
    const offset = doc.getText().indexOf('[[') + 2;
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      uri,
      doc.positionAt(offset),
      '[',
    );

    const dupItems = list.items.filter((i) => {
      const text = typeof i.label === 'string' ? i.label : i.label.label;
      return text === 'dup';
    });
    assert.strictEqual(dupItems.length, 2, 'both dup.md files should be suggested');

    const descriptions = dupItems.map((i) => {
      assert.notStrictEqual(
        typeof i.label,
        'string',
        'a duplicated item must use a CompletionItemLabel so its folder is always visible',
      );
      return (i.label as vscode.CompletionItemLabel).description;
    });
    // The two dup files live in a/ and b/; the folder shows, the file name does not.
    assert.deepStrictEqual(descriptions.slice().sort(), ['a/', 'b/']);
    for (const d of descriptions) {
      assert.ok(!d!.includes('dup'), `file name must not appear in the folder description: ${d}`);
    }
  });
});
