import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  {
    label: 'unique',
    files: 'out/test/e2e/{smoke,documentLinks,hover}.test.js',
    workspaceFolder: 'test/fixtures/unique-names',
    mocha: { ui: 'tdd', timeout: 20000 },
  },
  {
    label: 'ambiguous',
    files: 'out/test/e2e/ambiguous.test.js',
    workspaceFolder: 'test/fixtures/ambiguous-names',
    mocha: { ui: 'tdd', timeout: 20000 },
  },
  {
    label: 'boundary',
    files: 'out/test/e2e/boundary.test.js',
    workspaceFolder: 'test/fixtures/boundary',
    mocha: { ui: 'tdd', timeout: 20000 },
  },
]);
