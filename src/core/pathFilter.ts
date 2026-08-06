// Decide whether a workspace-relative path lives inside an excluded folder, and build the
// findFiles exclude glob from the same folder list. Pure: no I/O, no vscode.

export function isExcludedPath(relPath: string, excludedFolders: string[]): boolean {
  if (excludedFolders.length === 0) return false;
  const set = new Set(excludedFolders);
  return relPath.split(/[\\/]/).some((segment) => set.has(segment));
}

export function buildExcludeGlob(excludedFolders: string[]): string | undefined {
  const cleaned = excludedFolders.map((f) => f.trim()).filter((f) => f !== "");
  if (cleaned.length === 0) return undefined;
  if (cleaned.length === 1) return `**/${cleaned[0]}/**`;
  return `**/{${cleaned.join(",")}}/**`;
}
