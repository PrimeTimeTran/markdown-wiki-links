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

suite('Embeds (click-to-follow + hover preview)', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;

  test('![[note]] produces a document link to note.md', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    assert.ok(links.some((l) => (l.target?.fsPath ?? '').endsWith('note.md')));
  });

  test('![[diagram.png|300]] target is the PNG (size is not part of path)', async () => {
    const uri = vscode.Uri.joinPath(ws(), 'index.md');
    await vscode.workspace.openTextDocument(uri);
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      uri,
    );
    const png = links.find((l) => (l.target?.fsPath ?? '').endsWith('diagram.png'));
    assert.ok(png, 'expected png link');
    assert.ok(!(png!.target?.fsPath ?? '').includes('300'));
  });

  test('hover over ![[note]] shows the embedded markdown without YAML frontmatter', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '![[note]]', 3);
    assert.ok(txt.includes('Section body.') || txt.includes('# Note'), `hover was: ${txt}`);
    assert.ok(!txt.includes('title: The Note'), 'frontmatter must not appear in the preview');
  });

  test('hover over ![[note#Section]] shows just the section body', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '![[note#Section]]', 3);
    assert.ok(txt.includes('Section body.'));
  });

  test('hover over ![[diagram.png]] returns markdown containing the image reference', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '![[diagram.png]]', 3);
    assert.ok(txt.includes('diagram.png'), `hover was: ${txt}`);
    assert.ok(
      /!\[[^\]]*\]\(file:\/\//.test(txt),
      'expected an image markdown reference to a file URI',
    );
  });

  test('hover over ![[diagram.png|300]] preserves the 300-width size hint', async () => {
    const txt = await hoverAt(vscode.Uri.joinPath(ws(), 'index.md'), '![[diagram.png|300]]', 3);
    assert.ok(/=300x/.test(txt), `expected width hint in hover markdown, got: ${txt}`);
  });

  test('hover over a plain [[diagram.png]] link previews the image, not raw bytes', async () => {
    // The needle "[[diagram.png]]" also appears inside "![[diagram.png]]"; the last
    // occurrence in the fixture is the plain link on its own line.
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(ws(), 'index.md'));
    const offset = doc.getText().lastIndexOf('[[diagram.png]]') + 2;
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      doc.positionAt(offset),
    );
    const txt = hovers
      .flatMap((h) =>
        h.contents.map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value)),
      )
      .join('\n');
    assert.ok(/!\[[^\]]*\]\(file:\/\//.test(txt), `expected an image reference, got: ${txt}`);
    assert.ok(!/IDAT|IHDR/.test(txt), 'raw PNG bytes must not appear in the hover');
  });
});
