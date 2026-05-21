import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/e2e/**/*.test.js',
  workspaceFolder: 'test/fixtures/unique-names',
  mocha: { ui: 'tdd', timeout: 20000 },
});
