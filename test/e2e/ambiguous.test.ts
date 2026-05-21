import * as assert from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';

suite('Ambiguous + closest-parent', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  async function links(file: string): Promise<vscode.DocumentLink[]> {
    const uri = vscode.Uri.joinPath(ws(), file);
    await vscode.workspace.openTextDocument(uri);
    return vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', uri);
  }

  test('ambiguous [[dup]] produces no resolved file link', async () => {
    const found = await links('index.md');
    const dupLink = found.find(
      (l) => (l.target?.fsPath ?? '').endsWith('dup.md') && l.range.start.line === 0,
    );
    assert.strictEqual(dupLink, undefined);
  });

  test('explicit [[a/dup]] resolves to a/dup.md', async () => {
    const found = await links('index.md');
    assert.ok(found.some((l) => (l.target?.fsPath ?? '').endsWith(path.join('a', 'dup.md'))));
  });

  test('[[dup]] from nested file resolves via closest-parent (a/dup.md)', async () => {
    const found = await links(path.join('a', 'sub', 'ref.md'));
    const target = found.map((l) => l.target?.fsPath ?? '').find((t) => t.endsWith('dup.md'));
    assert.ok(target && target.endsWith(path.join('a', 'dup.md')), `target was: ${target}`);
  });
});
