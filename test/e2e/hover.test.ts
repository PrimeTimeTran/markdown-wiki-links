import * as assert from 'assert';

import * as vscode from 'vscode';

async function hoverAt(uri: vscode.Uri, needle: string, offsetInside = 2): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const offset = doc.getText().indexOf(needle) + offsetInside;
  const pos = doc.positionAt(offset);
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    uri,
    pos,
  );
  return hovers
    .flatMap((h) =>
      h.contents.map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value)),
    )
    .join('\n');
}

suite('HoverProvider', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  test('hover over [[alpha]] shows alpha.md contents', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '[[alpha]]');
    assert.ok(txt.includes('# Alpha'), `hover was: ${txt}`);
  });
  test('hover over [[alpha#Intro]] includes Intro section text', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '[[alpha#Intro]]');
    assert.ok(txt.includes('Intro'));
    assert.ok(txt.includes('Hello world'));
  });
  test('hover over [[#Local]] reads from same file', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '[[#Local]]');
    assert.ok(txt.includes('Local'));
  });
});
