import * as assert from 'assert';

import * as vscode from 'vscode';

suite('Preview contribution', () => {
  test('extension contributes markdown.markdownItPlugins', async () => {
    const ext = vscode.extensions.getExtension('local.vscode-wiki-links')!;
    await ext.activate();
    const c = ext.packageJSON.contributes;
    assert.strictEqual(c['markdown.markdownItPlugins'], true, 'markdownItPlugins must be declared');
  });
});
