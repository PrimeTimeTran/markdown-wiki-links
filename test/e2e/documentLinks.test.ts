import * as assert from 'assert';
import * as path from 'path';

import * as vscode from 'vscode';

suite('DocumentLinkProvider', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  test('plain [[alpha]] resolves to alpha.md', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    const targets = links.map((l) => l.target?.fsPath ?? '');
    assert.ok(
      targets.some((t) => t.endsWith(path.join('notes', 'alpha.md'))),
      `links: ${targets.join(', ')}`,
    );
  });

  test('[[beta|Bravo]] resolves; display does not affect target', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    assert.ok(
      links.some((l) => (l.target?.fsPath ?? '').endsWith(path.join('notes', 'sub', 'beta.md'))),
    );
  });

  test('[[alpha#Intro]] target carries a line fragment pointing at the heading', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    const hit = links.find(
      (l) =>
        (l.target?.fsPath ?? '').endsWith('alpha.md') && (l.target?.fragment ?? '').startsWith('L'),
    );
    assert.ok(hit, 'expected link with line fragment');
  });

  test('[[#Local]] stays inside the source file', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    const hit = links.find((l) => l.target?.fsPath === uri.fsPath);
    assert.ok(hit, 'expected a same-file link target');
  });
});
