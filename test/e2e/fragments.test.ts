import * as assert from 'assert';

import * as vscode from 'vscode';

async function linksFor(file: string): Promise<vscode.DocumentLink[]> {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, file);
  await vscode.workspace.openTextDocument(uri);
  return vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', uri);
}

suite('Fragments', () => {
  test('each fragment kind produces a link with a line fragment', async () => {
    const links = await linksFor('source.md');
    const lineFragmentLinks = links.filter((l) => (l.target?.fragment ?? '').startsWith('L'));
    // Section One, ^para-a, ^list-id, ^quote-id, and [[#Top]] all carry #L fragments.
    assert.ok(
      lineFragmentLinks.length >= 4,
      `expected >=4 line-fragment links, got ${lineFragmentLinks.length}`,
    );
  });

  test('[[#Top]] points at the source file itself', async () => {
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const src = vscode.Uri.joinPath(ws, 'source.md');
    const links = await linksFor('source.md');
    assert.ok(
      links.some(
        (l) => l.target?.fsPath === src.fsPath && (l.target?.fragment ?? '').startsWith('L'),
      ),
    );
  });
});
