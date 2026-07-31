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
