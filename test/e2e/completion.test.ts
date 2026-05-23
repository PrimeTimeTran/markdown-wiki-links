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

// Our fragment items set `detail = "line N"`; this filters out the editor's built-in word
// completions so the assertion only sees what our provider contributed.
function ourFragmentItems(list: vscode.CompletionList): vscode.CompletionItem[] {
  return list.items.filter((i) => typeof i.detail === 'string' && /^line \d+$/.test(i.detail));
}

function labelText(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : item.label.label;
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

  test('fragment items appear in document order (sortText reflects line ordering)', async () => {
    // alpha.md fixture: # Alpha (line 1) -> ## Intro (line 3) -> ^p1 (line 5).
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    const doc = await vscode.workspace.openTextDocument(uri);
    const offset = doc.getText().indexOf('[[alpha#') + '[[alpha#'.length;
    const list = await completions(uri, doc.positionAt(offset), '#');
    const ours = ourFragmentItems(list).sort((a, b) =>
      (a.sortText ?? '').localeCompare(b.sortText ?? ''),
    );
    const orderedLabels = ours.map(labelText);
    assert.deepStrictEqual(
      orderedLabels,
      ['Alpha', 'Intro', '^p1'],
      `expected document order, got: ${orderedLabels.join(', ')}`,
    );
  });

  test('heading items expose their level as the dropdown description (H1, H2, ...)', () => {
    // The label shape `{label, description}` is what VSCode renders dim beside the main label.
    // alpha.md: # Alpha is H1, ## Intro is H2; ^p1 (block-id) carries no description.
    const ws = vscode.workspace.workspaceFolders![0].uri;
    const uri = vscode.Uri.joinPath(ws, 'index.md');
    return vscode.workspace.openTextDocument(uri).then(async (doc) => {
      const offset = doc.getText().indexOf('[[alpha#') + '[[alpha#'.length;
      const list = await completions(uri, doc.positionAt(offset), '#');
      const byLabel = new Map(ourFragmentItems(list).map((i) => [labelText(i), i]));
      const alpha = byLabel.get('Alpha');
      const intro = byLabel.get('Intro');
      const p1 = byLabel.get('^p1');
      assert.ok(alpha && typeof alpha.label !== 'string', 'Alpha label should carry a description');
      assert.strictEqual(
        (alpha!.label as vscode.CompletionItemLabel).description,
        'H1',
        '# Alpha should be H1',
      );
      assert.ok(intro && typeof intro.label !== 'string', 'Intro label should carry a description');
      assert.strictEqual(
        (intro!.label as vscode.CompletionItemLabel).description,
        'H2',
        '## Intro should be H2',
      );
      // Block-id items keep the plain string label (no level).
      assert.strictEqual(typeof p1!.label, 'string', '^p1 (block-id) carries no description');
    });
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
