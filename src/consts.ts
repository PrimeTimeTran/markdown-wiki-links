export const EXT_PATH = "/Users/future/KB/project/app/markdown-wiki-links";

export const AnchorTags = {
  SoftDeleted: "softDeleted",
  Pipeline: "pipeline",
  Index: "index",
  Wiki: "wiki",
} as const;

export const SectionList = {
  Draft: "draft",
  Pipeline: "pipeline",
  Plan: "plan",
} as const;

export type LangsShort = string[];
export const supportedLanguages: LangsShort = [
  "markdown",
  "javascript",
  "typescript",
  "rust",
  "json",
];
export type LangsLong = {
  language: string;
}[];
export const longLangs = [
  { language: "rust" },
  { language: "markdown" },
  { language: "typescript" },
  { language: "javascript" },
  { language: "json" },
];

export const SECTIONS_LIST = [SectionList.Draft, SectionList.Pipeline, SectionList.Plan];
// export const SECTIONS = {
//   [SECTIONS_LIST[0]]: {},
//   [SECTIONS_LIST[1]]: {},
//   [SECTIONS_LIST[2]]: {},
// };
export const SNIPPET_ITEMS = [
  {
    label: "HTML",
    id: "html",
    template: `<!doctype html>
<html>
    <head>
    <title>Snippet</title>
    </head>
    <body>
    </body>
</html>`,
  },

  {
    label: "JavaScript",
    id: "javascript",
    template: `function main() {
}

main();`,
  },

  {
    label: "CSS",
    id: "css",
    template: `.container {

}`,
  },

  {
    label: "JSON",
    id: "json",
    template: `{
  
}`,
  },
];
