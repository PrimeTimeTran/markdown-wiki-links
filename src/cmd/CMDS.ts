import type { CommandDefinition } from "./command-schema";

const newCmd: CommandDefinition = {
  id: "estate.anchor.view",
  title: "Estate: View anchor",
  icon: "$(preview)",
  menus: [
    {
      menu: "editor/title/context",
      group: "navigation",
    },
  ],
};

const items = ["anchor", "series", "settings", "snippet"];

// TODO:
// Menu icons aren't behaving consistently in sidebar click of file explorer
// Tab switchhotkey)
export const COMMANDS: CommandDefinition[] = [
  {
    title: "Estate: View Options",
    id: "estate.explore.options",
    icon: "$(filter)",
    menus: [
      {
        menu: "view/title",
        group: "navigation",
        when: "view == estateExplorer",
      },
    ],
  },
  {
    title: "Estate: Create bookmark",
    id: "estate.bookmark.create",
    icon: "$(add)",
    menus: [
      {
        // Sidebar top level menu
        menu: "view/title",
        group: "navigation",
      },
      {
        // Editor top tabs menu
        menu: "editor/title",
        group: "navigation",
        when: "!estate.hasAnchor",
      },
      {
        // Sidebar tree list row
        menu: "view/item/context",
        group: "inline",
      },
    ],
  },
  {
    title: "Estate: View bookmark",
    id: "estate.bookmark.read",
    icon: "$(view)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        // When Sidebar Estate Explorer is visible
        when: "estate.hasAnchor && !estateExplorer.visible",
      },
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Edit bookmark",
    id: "estate.bookmark.update",
    icon: "$(edit)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Delete bookmark",
    id: "estate.bookmark.delete",
    icon: "$(trash)",
    menus: [
      // Show an option to delete this bookmark item in the editor title
      // when estate explorer is visible
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Filter bookmarks",
    id: "estate.bookmark.filter",
    icon: "$(filter)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor && estateExplorer.visible",
      },
      {
        menu: "view/item/context",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Create settings",
    id: "estate.settings.create",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor && estateExplorer.visible",
      },
    ],
    icon: "$(add)",
  },
  {
    title: "Estate: View settings",
    id: "estate.settings.read",
    icon: "$(view)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Edit settings",
    id: "estate.settings.update",
    icon: "$(edit)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
        when: "estate.hasAnchor",
      },
    ],
  },
  {
    title: "Estate: Delete settings",
    id: "estate.settings.delete",
    icon: "$(trash)",
    menus: [
      {
        menu: "editor/title",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Create series",
    id: "estate.series.create",
    icon: "$(add)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: View series",
    id: "estate.series.read",
    icon: "$(view)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Edit series",
    id: "estate.series.update",
    icon: "$(edit)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  {
    title: "Estate: Delete series",
    id: "estate.series.delete",
    icon: "$(trash)",
    menus: [
      {
        menu: "view/item/context",
        group: "navigation",
      },
    ],
  },
  newCmd,
  {
    id: "ui.toggleMDPreview",
    title: "Wiki Links: Preview Mode (Toggle)",
  },
  {
    id: "flowify.analyzeLine",
    title: "Estate: Analyze Subject",
  },
  {
    id: "estate.snippet.create",
    title: "Estate: Create snippet",
    icon: "$(filter)",
    shortTitle: "Create a snippet in any language quick and easy.",
  },
  {
    id: "estate.snippet.read",
    title: "Estate: Read snippet",
    icon: "$(filter)",
    shortTitle: "View snippets",
  },
  {
    id: "estate.snippet.update",
    title: "Estate: Update snippet",
    icon: "$(filter)",
    shortTitle: "Update snippts",
  },
  {
    id: "estate.snippet.delete",
    title: "Estate: Delete snippet",
    icon: "$(filter)",
    shortTitle: "Delete snippet",
  },
  {
    id: "estate.anchor.pipeline",
    title: "Estate: Anchor a pipeline's flow",
    shortTitle:
      "Understand your code by noting steps through configuration files, branches, and variants",

    icon: "$(type-hierarchy-sub)",

    category: "Estate",

    enablement: "estate.input",

    docs: {
      path: "docs/commands/anchor-pipeline.md",
      description: "Creates pipeline anchors from configuration and code flow.",
    },

    implementation: {
      file: "src/commands/anchorPipeline.ts",
      symbol: "anchorPipeline",
    },

    menus: [
      {
        menu: "editor/context",
        when: "editorLangId == rust",
        group: "estate@1",
      },
      {
        menu: "view/item/context",
        when: "view == estateTree",
        group: "estate@1",
      },
    ],
    keybindings: [
      {
        key: "ctrl+alt+a",
        when: "editorTextFocus",
      },
    ],
  },

  {
    id: "estate.show.ownership",

    title: "Estate: Show Ownership Analysis",

    shortTitle: "Visualize ownership relationships and affected code regions",

    icon: "$(references)",

    category: "Analysis",

    enablement: "estate.rustAnalyzerReady",

    docs: {
      path: "docs/commands/show-ownership.md",
    },

    implementation: {
      file: "src/commands/showOwnership.ts",
      symbol: "showOwnership",
    },

    menus: [
      {
        menu: "editor/title",
        when: "editorLangId == rust",
        group: "estate",
      },
    ],

    keybindings: [
      {
        key: "ctrl+alt+o",
        when: "editorLangId == rust",
      },
    ],
  },
];
