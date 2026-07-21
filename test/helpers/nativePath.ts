import * as path from 'path';

// Unit fixtures spell their paths POSIX-style ('/root/a/b.md') because that reads well and
// keeps the tests short. The core modules navigate paths with Node's *platform* `path`, so
// on Windows those literals describe nothing real: `path.sep` is '\\', and isContained and
// the ancestor walk compare against separators the literal never contains. Every bare-name
// resolution then fails, and the whole suite reports failures that say nothing about the
// code under test.
//
// Translating at the fixture boundary keeps one readable set of literals pinning behavior on
// both platforms. Assertions on a returned fsPath must be wrapped too — the resolver echoes
// back the entry path it was given, which is now native.
const ROOT = process.platform === 'win32' ? 'C:\\' : '/';

/** '/root/a/b.md' → '/root/a/b.md' on POSIX, 'C:\root\a\b.md' on Windows. */
export function np(posixPath: string): string {
  const segments = posixPath.replace(/^\//, '').split('/');
  return path.join(ROOT, ...segments);
}
