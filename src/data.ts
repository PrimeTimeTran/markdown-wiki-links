export const GLOB = "**/*.{md,markdown,png,jpg,jpeg,gif,webp,svg,rs,ts,js,py}";
// The same extension set as GLOB. add() must enforce it directly: rename events are not
// filtered by the watcher glob, so without this a renamed folder (or a .md renamed to .txt)
// would be inserted into the index as a link target.
export const INDEXABLE_RE = /\.(rs|js|ts|py|md|markdown|png|jpe?g|gif|webp|svg)$/i;
// Soft cap on indexed files. Each entry is three short strings plus object/Map overhead —
// roughly 350-450 bytes — so the 50,000 default costs on the order of 20 MB of heap.
export const DEFAULT_INDEX_MAX_FILES = 50000;

export const DEFAULT_EXCLUDED_FOLDERS = [
  ".git",
  "node_modules",
  "target",
  ".hg",
  ".svn",
  ".bzr",
  "bower_components",
];
