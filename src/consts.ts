export const EXT_PATH = '/Users/future/KB/project/app/markdown-wiki-links';

// export interface Lang {
//   language: string;
// }
// export interface Lang {
//   language: string;
// }

// export type LangsLong = Lang[];

export type LangsShort = string[];
export const supportedLanguages: LangsShort = ['markdown', 'javascript', 'typescript', 'rust'];

export type LangsLong = {
  language: string;
}[];

export const longLangs = [
  { language: 'rust' },
  { language: 'markdown' },
  { language: 'typescript' },
  { language: 'javascript' },
];

export const SECTIONS_LIST = ['main', 'series', 'blank'];
export const SECTIONS = {
  [SECTIONS_LIST[0]]: {},
  [SECTIONS_LIST[1]]: {},
  [SECTIONS_LIST[2]]: {},
};

export const SNIPPET_ITEMS = [
  {
    label: 'HTML',
    id: 'html',
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
    label: 'JavaScript',
    id: 'javascript',
    template: `function main() {
}

main();`,
  },

  {
    label: 'CSS',
    id: 'css',
    template: `.container {

}`,
  },

  {
    label: 'JSON',
    id: 'json',
    template: `{
  
}`,
  },
];
