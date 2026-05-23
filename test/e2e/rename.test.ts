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
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
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

suite('Rename propagation across sibling folders', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const inboxHome = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'Inbox', 'home.md');
  const draftsReadme = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'Drafts', 'README.md');
  const draftsRenamed = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'Drafts', 'README3.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(draftsRenamed());
    await writeText(inboxHome(), 'A draft link: ![[Drafts/README]].\n');
    await writeText(draftsReadme(), '# Readme\n');
  });

  suiteTeardown(async () => {
    await tryDelete(draftsRenamed());
    await tryDelete(inboxHome());
    await tryDelete(draftsReadme());
  });

  test('a slashed link is rewritten root-relative, never with ".." segments', async () => {
    await vscode.workspace.openTextDocument(inboxHome());

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(draftsReadme(), draftsRenamed(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(inboxHome());
      return d.getText().includes('README3');
    });
    const text = (await vscode.workspace.openTextDocument(inboxHome())).getText();
    assert.ok(text.includes('![[Drafts/README3]]'), `expected root-relative link, got: ${text}`);
    assert.ok(!text.includes('..'), `rewritten link must not contain "..": ${text}`);
  });
});

suite('Rename propagation for media files', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const note = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'note-with-image.md');
  const imageOld = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'diagram.png');
  const imageNew = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'chart.png');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(imageNew());
    await writeText(note(), 'See ![[diagram.png]] and the link [[diagram.png]].\n');
    // The bytes are irrelevant to rename rewriting; the file just has to exist.
    await vscode.workspace.fs.writeFile(imageOld(), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  suiteTeardown(async () => {
    await tryDelete(imageNew());
    await tryDelete(imageOld());
    await tryDelete(note());
  });

  test('renaming an image rewrites the ![[...]] embed and the [[...]] link to it', async () => {
    await vscode.workspace.openTextDocument(note());

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(imageOld(), imageNew(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(note());
      return d.getText().includes('chart.png');
    });
    const text = (await vscode.workspace.openTextDocument(note())).getText();
    assert.ok(text.includes('![[chart.png]]'), `embed not rewritten: ${text}`);
    assert.ok(text.includes('[[chart.png]]'), `link not rewritten: ${text}`);
    assert.ok(!text.includes('diagram.png'), `stale image reference remains: ${text}`);
  });
});
