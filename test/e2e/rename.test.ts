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

suite('Rename propagation to a referrer never opened in an editor', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'closed-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'closed-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'closed-new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(newT());
    await writeText(referrer(), 'A link: [[closed-old]] here.\n');
    await writeText(oldT(), '# Closed old\n');
  });

  suiteTeardown(async () => {
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('links are rewritten even when the referrer was never opened', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('[[closed-new]]');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(text.includes('A link: [[closed-new]] here.'), `not rewritten: ${text}`);
  });
});

suite('Rename propagation into a dirty (unsaved) referrer buffer', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'dirty-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'dirty-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'dirty-new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(newT());
    await writeText(referrer(), 'Saved link [[dirty-old]].\n');
    await writeText(oldT(), '# Dirty old\n');
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('unsaved buffer text is what gets rewritten, and unsaved edits survive', async () => {
    const doc = await vscode.workspace.openTextDocument(referrer());
    await vscode.window.showTextDocument(doc);
    const insert = new vscode.WorkspaceEdit();
    insert.insert(referrer(), new vscode.Position(0, 0), 'Unsaved link [[dirty-old]] first.\n');
    assert.strictEqual(await vscode.workspace.applyEdit(insert), true);
    assert.strictEqual(doc.isDirty, true, 'referrer buffer should be dirty before the rename');

    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(() => doc.getText().includes('Saved link [[dirty-new]].'));
    const text = doc.getText();
    assert.ok(text.includes('Unsaved link [[dirty-new]] first.'), `unsaved line lost: ${text}`);
    assert.ok(!text.includes('dirty-old'), `stale reference remains: ${text}`);
  });
});

suite('Rename propagation in a CRLF referrer', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'crlf-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'crlf-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'crlf-new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(newT());
    await writeText(
      referrer(),
      'Top line.\r\n\r\nSee [[crlf-old]] here, and [[crlf-old|D]].\r\n\r\n' +
        '```\r\nfenced [[crlf-old]] stays\r\n```\r\n',
    );
    await writeText(oldT(), '# CRLF old\n');
  });

  suiteTeardown(async () => {
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('rewrites land at the correct positions on CRLF lines', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('[[crlf-new]]');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(
      text.includes('See [[crlf-new]] here, and [[crlf-new|D]].'),
      `mangled rewrite: ${JSON.stringify(text)}`,
    );
    assert.ok(
      text.includes('fenced [[crlf-old]] stays'),
      `fenced CRLF occurrence must not be rewritten: ${JSON.stringify(text)}`,
    );
  });
});

suite('Rename propagation in a non-UTF-8 (UTF-16 BOM) referrer', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'utf16-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'utf16-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'utf16-new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(newT());
    const body = 'Tiếng Việt trước [[utf16-old]] sau.\n';
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]);
    await vscode.workspace.fs.writeFile(referrer(), bytes);
    await writeText(oldT(), '# UTF16 old\n');
  });

  suiteTeardown(async () => {
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('links in a UTF-16 referrer are rewritten at the correct positions', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('[[utf16-new]]');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(
      text.includes('Tiếng Việt trước [[utf16-new]] sau.'),
      `mangled or missing rewrite: ${JSON.stringify(text)}`,
    );
  });
});

suite('Rename propagation when moving/renaming a folder', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const oldDir = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'moving');
  const newDir = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'moved');
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'folder-referrer.md');

  async function tryDeleteDir(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri, { recursive: true });
    } catch {
      // already gone
    }
  }

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDeleteDir(newDir());
    await tryDeleteDir(oldDir());
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(oldDir(), 'sub'));
    await writeText(vscode.Uri.joinPath(oldDir(), 'inner.md'), '# Inner\n');
    await writeText(vscode.Uri.joinPath(oldDir(), 'sub', 'deep.md'), '# Deep\n');
    await writeText(
      referrer(),
      'See [[moving/inner]] and ![[moving/inner]] and [[moving/sub/deep]].\n',
    );
  });

  suiteTeardown(async () => {
    await tryDeleteDir(newDir());
    await tryDeleteDir(oldDir());
    await tryDelete(referrer());
  });

  test('renaming a folder rewrites slashed links to the files inside it', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldDir(), newDir(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('[[moved/inner]]');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(text.includes('See [[moved/inner]]'), `link not rewritten: ${text}`);
    assert.ok(text.includes('![[moved/inner]]'), `embed not rewritten: ${text}`);
    assert.ok(text.includes('[[moved/sub/deep]]'), `nested link not rewritten: ${text}`);
    assert.ok(!text.includes('moving/'), `stale folder reference remains: ${text}`);
  });
});

suite('Rename propagation re-anchors links inside a moved folder', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const anchorA = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'anchorA');
  const anchorB = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'anchorB');
  const movedDir = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'anchorMoved');
  const refInSub = (): vscode.Uri => vscode.Uri.joinPath(anchorA(), 'sub', 'ref.md');

  async function tryDeleteDir(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri, { recursive: true });
    } catch {
      // already gone
    }
  }

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDeleteDir(movedDir());
    await tryDeleteDir(anchorA());
    await tryDeleteDir(anchorB());
    // [[anchor-notes]] is ambiguous (anchorA/ and anchorB/ both have one, none at the
    // root), so from anchorA/sub it resolves via the closest-parent walk to anchorA's.
    await writeText(vscode.Uri.joinPath(anchorA(), 'anchor-notes.md'), '# A notes\n');
    await writeText(vscode.Uri.joinPath(anchorB(), 'anchor-notes.md'), '# B notes\n');
    await writeText(refInSub(), 'See [[anchor-notes]].\n');
  });

  suiteTeardown(async () => {
    await tryDeleteDir(movedDir());
    await tryDeleteDir(anchorA());
    await tryDeleteDir(anchorB());
  });

  test('a walk-resolved bare link is rewritten so it keeps its target after the move', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(vscode.Uri.joinPath(anchorA(), 'sub'), movedDir(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    const movedRef = vscode.Uri.joinPath(movedDir(), 'ref.md');
    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(movedRef);
      return d.getText().includes('[[anchorA/anchor-notes]]');
    });
    const text = (await vscode.workspace.openTextDocument(movedRef)).getText();
    assert.ok(
      text.includes('See [[anchorA/anchor-notes]].'),
      `link not re-anchored to its original target: ${text}`,
    );
  });
});

suite('Rename propagation in a BOM-less UTF-16 referrer', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'nobom16-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'nobom16-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'nobom16-new.md');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    await tryDelete(newT());
    // ASCII-only UTF-16LE without a BOM: every byte pair decodes as valid UTF-8 (char +
    // NUL), so a naive UTF-8 decode sees no replacement characters at all.
    const body = 'See [[nobom16-old]] here.\n';
    await vscode.workspace.fs.writeFile(referrer(), Buffer.from(body, 'utf16le'));
    await writeText(oldT(), '# Old\n');
  });

  suiteTeardown(async () => {
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('links in a BOM-less UTF-16 referrer are still rewritten', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('[[nobom16-new]]');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(text.includes('See [[nobom16-new]] here.'), `not rewritten: ${text}`);
  });
});

suite('Rename propagation with files.encoding set to a legacy codepage', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'w1252-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'w1252-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'w1252-new.md');
  const filesConfig = (): vscode.WorkspaceConfiguration =>
    vscode.workspace.getConfiguration('files');

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    // Self-heal from a previous crashed run before flipping the setting for this suite —
    // a leftover windows1252 would silently slow-path every other suite in this fixture.
    await filesConfig().update('encoding', undefined, vscode.ConfigurationTarget.Workspace);
    await filesConfig().update('encoding', 'windows1252', vscode.ConfigurationTarget.Workspace);
    await tryDelete(newT());
    // 'café' written as UTF-8 bytes is ALSO valid windows1252 (as 'cafÃ©', one char
    // longer). A naive UTF-8 decode computes offsets that disagree with how VSCode
    // (configured for windows1252) positions the edit — splicing mid-link.
    const bytes = Buffer.from('café sees [[w1252-old]] here.\n', 'utf8');
    await vscode.workspace.fs.writeFile(referrer(), bytes);
    await writeText(oldT(), '# Old\n');
  });

  suiteTeardown(async () => {
    await filesConfig().update('encoding', undefined, vscode.ConfigurationTarget.Workspace);
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('rewrites land at positions consistent with the configured encoding', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('w1252-new');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(
      text.includes('sees [[w1252-new]] here.'),
      `mangled rewrite: ${JSON.stringify(text)}`,
    );
  });
});

suite('Rename propagation with a language-scoped [markdown] files.encoding', () => {
  const ws = (): vscode.Uri => vscode.workspace.workspaceFolders![0].uri;
  const referrer = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'langscope-referrer.md');
  const oldT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'langscope-old.md');
  const newT = (): vscode.Uri => vscode.Uri.joinPath(ws(), 'langscope-new.md');
  // Language-scoped configuration: writes into "[markdown]": { "files.encoding": ... },
  // which a bare-Uri getConfiguration scope cannot see.
  const mdFilesConfig = (): vscode.WorkspaceConfiguration =>
    vscode.workspace.getConfiguration('files', { languageId: 'markdown' });

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    await ext!.activate();
    // Self-heal from a previous crashed run before flipping the setting for this suite.
    await mdFilesConfig().update('encoding', undefined, vscode.ConfigurationTarget.Workspace, true);
    await mdFilesConfig().update(
      'encoding',
      'windows1252',
      vscode.ConfigurationTarget.Workspace,
      true,
    );
    await tryDelete(newT());
    // Same trap as the resource-scoped w1252 suite: 'café' as UTF-8 bytes is also valid
    // windows1252 (one char longer), so offsets computed from a raw UTF-8 decode disagree
    // with VSCode's language-override decode and would splice mid-link.
    const bytes = Buffer.from('café sees [[langscope-old]] here.\n', 'utf8');
    await vscode.workspace.fs.writeFile(referrer(), bytes);
    await writeText(oldT(), '# Old\n');
  });

  suiteTeardown(async () => {
    await mdFilesConfig().update('encoding', undefined, vscode.ConfigurationTarget.Workspace, true);
    await tryDelete(newT());
    await tryDelete(oldT());
    await tryDelete(referrer());
  });

  test('rewrites land at positions consistent with the [markdown]-scoped encoding', async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(oldT(), newT(), { overwrite: false });
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    await waitFor(async () => {
      const d = await vscode.workspace.openTextDocument(referrer());
      return d.getText().includes('langscope-new');
    });
    const text = (await vscode.workspace.openTextDocument(referrer())).getText();
    assert.ok(
      text.includes('sees [[langscope-new]] here.'),
      `mangled rewrite: ${JSON.stringify(text)}`,
    );
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
