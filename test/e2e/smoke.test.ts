import * as assert from 'assert';

import * as vscode from 'vscode';

suite('smoke', () => {
  test('extension is present and activated', async () => {
    const ext = vscode.extensions.getExtension('ltvan.markdown-wiki-links');
    assert.ok(ext, 'extension package present');
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });
});
