import type { CommandDefinition } from './command-schema';

const newCmd: CommandDefinition = {
  id: 'estate.bookmark.view',
  title: 'Estate: View Bookmark',
  icon: '$(preview)',
  menus: [
    {
      menu: 'editor/title/context',
      group: 'navigation',
    },
  ],
};

export const COMMANDS2: CommandDefinition[] = [];
export const COMMANDS: CommandDefinition[] = [
  {
    id: 'estate.filter',
    title: 'Estate: Filter',
    icon: '$(filter)',
    shortTitle: 'estate filter',
    menus: [
      {
        menu: 'view/title',
        group: 'navigation',
      },
    ],
  },
  newCmd,
  {
    id: 'estate.anchor.pipeline',

    title: "Estate: Anchor a pipeline's flow",

    shortTitle:
      'Understand your code by noting steps through configuration files, branches, and variants',

    icon: '$(type-hierarchy-sub)',

    category: 'Estate',

    enablement: 'estate.input',

    docs: {
      path: 'docs/commands/anchor-pipeline.md',
      description: 'Creates pipeline anchors from configuration and code flow.',
    },

    implementation: {
      file: 'src/commands/anchorPipeline.ts',
      symbol: 'anchorPipeline',
    },

    menus: [
      {
        menu: 'editor/context',
        when: 'editorLangId == rust',
        group: 'estate@1',
      },
      {
        menu: 'view/item/context',
        when: 'view == estateTree',
        group: 'estate@1',
      },
    ],

    keybindings: [
      {
        key: 'ctrl+alt+a',
        when: 'editorTextFocus',
      },
    ],
  },

  {
    id: 'estate.show.ownership',

    title: 'Estate: Show Ownership Analysis',

    shortTitle: 'Visualize ownership relationships and affected code regions',

    icon: '$(references)',

    category: 'Analysis',

    enablement: 'estate.rustAnalyzerReady',

    docs: {
      path: 'docs/commands/show-ownership.md',
    },

    implementation: {
      file: 'src/commands/showOwnership.ts',
      symbol: 'showOwnership',
    },

    menus: [
      {
        menu: 'editor/title',
        when: 'editorLangId == rust',
        group: 'estate',
      },
    ],

    keybindings: [
      {
        key: 'ctrl+alt+o',
        when: 'editorLangId == rust',
      },
    ],
  },
];
