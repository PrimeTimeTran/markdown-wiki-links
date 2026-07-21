import * as assert from 'assert';

import * as vscode from 'vscode';

import { waitFor } from '../helpers/waitFor';

async function writeText(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}

async function tryDeleteDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri, { recursive: true });
  } catch {
    // already gone
  }
}

suite('Cross-root folder move', () => {
  const rootA = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const rootB = (): vscode.Uri => vscode.workspace.workspaceFolders![1].uri;
  const dirA = (): vscode.Uri => vscode.Uri.joinPath(rootA(), 'a');
  const dirB = (): vscode.Uri => vscode.Uri.joinPath(rootA(), 'b');
  const movedSub = (): vscode.Uri => vscode.Uri.joinPath(rootB(), 'sub');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDeleteDir(movedSub());
    await tryDeleteDir(dirA());
    await tryDeleteDir(dirB());
    // [[notes]] is ambiguous inside rootA (a/ and b/ each have one, none at the root),
    // so from a/sub it resolves via the closest-parent walk to a/notes.md.
    await writeText(vscode.Uri.joinPath(dirA(), 'notes.md'), '# A notes\n');
    await writeText(vscode.Uri.joinPath(dirB(), 'notes.md'), '# B notes\n');
    await writeText(vscode.Uri.joinPath(dirA(), 'sub', 'ref.md'), 'See [[notes]].\n');
  });

  suiteTeardown(async () => {
    await tryDeleteDir(movedSub());
    await tryDeleteDir(dirA());
    await tryDeleteDir(dirB());
  });

  test('a link that no wiki-link form can reach from the destination root is left untouched', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(vscode.Uri.joinPath(dirA(), 'sub'), movedSub(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    const movedRef = vscode.Uri.joinPath(movedSub(), 'ref.md');
    await waitFor(async () => {
      try {
        await vscode.workspace.fs.stat(movedRef);
        return true;
      } catch {
        return false;
      }
    });
    // Wiki-links never resolve across workspace roots, so no rewritten form could work
    // from rootB — the only correct outcome is to leave the text alone. Writing a
    // rootA-relative form like [[a/notes]] would be a dead link.
    const text = (await vscode.workspace.openTextDocument(movedRef)).getText();
    assert.strictEqual(text, 'See [[notes]].\n', `link must be left untouched, got: ${text}`);
  });
});
