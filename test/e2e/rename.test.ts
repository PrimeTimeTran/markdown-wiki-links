import * as assert from 'assert';

import * as vscode from 'vscode';

import { waitFor } from '../helpers/waitFor';

const HOME_BODY =
  'See [[old]] and [[old|Display]] and [[old#H]] and ![[old]].\n\n' +
  '```\nsee [[old]] in fence\n```\n';
const OLD_BODY = '# Old\n\n## H\n';

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}

async function tryDelete(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // already gone
  }
}

suite('Rename propagation', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const home = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'home.md');
  const old = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'old.md');
  const neu = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('local.vscode-wiki-links');
    await ext!.activate();
    await tryDelete(neu());
    await writeText(home(), HOME_BODY);
    await writeText(old(), OLD_BODY);
  });

  suiteTeardown(async () => {
    await tryDelete(neu());
    await tryDelete(home());
    await tryDelete(old());
  });

  test('renaming old.md to new.md rewrites bracket references, leaves fenced occurrences alone', async () => {
    await vscode.workspace.openTextDocument(home());

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(old(), neu(), { overwrite: false });
    const ok = await vscode.workspace.applyEdit(edit);
    assert.strictEqual(ok, true);

    // The reference-update edit lands in the home.md buffer (as VSCode's own rename
    // participants do). Wait for the buffer to reflect it, then read the document text.
    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(home());
      return d.getText().includes('[[new]]');
    });
    const text = (await vscode.workspace.openTextDocument(home())).getText();
    assert.ok(text.includes('[[new]]'), 'plain link rewritten');
    assert.ok(text.includes('[[new|Display]]'), 'display preserved');
    assert.ok(text.includes('[[new#H]]'), 'fragment preserved');
    assert.ok(text.includes('![[new]]'), 'embed rewritten');
    assert.ok(text.includes('see [[old]] in fence'), 'fenced occurrence untouched');
    const oldCount = (text.match(/\[\[old/g) ?? []).length;
    assert.strictEqual(oldCount, 1, `expected exactly 1 old reference (fenced), got ${oldCount}`);
  });
});
