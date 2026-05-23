import * as assert from 'assert';

import * as vscode from 'vscode';

async function completions(
  uri: vscode.Uri,
  pos: vscode.Position,
  trigger: string,
): Promise<vscode.CompletionList> {
  return vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    uri,
    pos,
    trigger,
  );
}

function labelsOf(list: vscode.CompletionList): string[] {
  return list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
}

suite('CompletionProvider', () => {
  test('typing [[ at end of file suggests workspace files', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    const offset = doc.getText().lastIndexOf('[[') + 2;
    const list = await completions(uri, doc.positionAt(offset), '[');
    const labels = labelsOf(list);
    assert.ok(labels.includes('alpha'), `expected 'alpha' in: ${labels.join(', ')}`);
    assert.ok(labels.includes('beta'), `expected 'beta' in: ${labels.join(', ')}`);
  });

  test('[[alpha# suggests headings from alpha.md', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    // Cursor immediately after the # in `[[alpha#Intro]]`.
    const offset = doc.getText().indexOf('[[alpha#') + '[[alpha#'.length;
    const list = await completions(uri, doc.positionAt(offset), '#');
    const labels = labelsOf(list);
    assert.ok(
      labels.includes('Alpha') && labels.includes('Intro'),
      `expected alpha.md headings in: ${labels.join(', ')}`,
    );
  });

  test('[[alpha# also suggests block-ids from alpha.md', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    const offset = doc.getText().indexOf('[[alpha#') + '[[alpha#'.length;
    const list = await completions(uri, doc.positionAt(offset), '#');
    const labels = labelsOf(list);
    assert.ok(labels.includes('^p1'), `expected ^p1 block-id in: ${labels.join(', ')}`);
  });

  test('[[# suggests headings from the current file', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    // Cursor immediately after the # in `[[#Local]]`.
    const offset = doc.getText().indexOf('[[#') + '[[#'.length;
    const list = await completions(uri, doc.positionAt(offset), '#');
    const labels = labelsOf(list);
    assert.ok(
      labels.includes('Local') && labels.includes('Index'),
      `expected same-file headings (Index, Local) in: ${labels.join(', ')}`,
    );
  });
});
