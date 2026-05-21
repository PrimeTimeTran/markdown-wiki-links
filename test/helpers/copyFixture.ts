import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function copyFixtureToTemp(fixtureName: string): string {
  const src = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', fixtureName);
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), `wiki-fx-${fixtureName}-`));
  copyRecursive(src, dst);
  return dst;
}

function copyRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}
