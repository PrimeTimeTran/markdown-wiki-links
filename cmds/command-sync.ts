import type { Keybinding } from './command-schema';

export const COMMAND_NAMES: CommandDefinition[] = [
  {
    id: 'estate.anchor.pipeline',
    title: "Estate: Anchor a pipeline's flow",
    shortTitle:
      'Understand your code by noting steps through configuration files, branches, and variants',

    icon: '$(type-hierarchy-sub)',
    category: 'Estate',

    enablement: 'estate.input',

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
      {
        menu: 'view/title',
        when: 'view == estateTree',
        group: 'navigation',
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
    shortTitle: 'Visualize ownership flow, borrowing relationships, and affected regions',

    icon: '$(symbol-reference)',
    category: 'Analysis',

    enablement: 'estate.rustAnalyzerReady',

    menus: [
      {
        menu: 'editor/context',
        when: 'editorLangId == rust',
        group: 'estate.analysis',
      },
      {
        menu: 'editor/title',
        when: 'editorLangId == rust',
        group: 'estate',
      },
    ],

    keybindings: [
      {
        key: 'ctrl+alt+o',
        when: 'editorTextFocus && editorLangId == rust',
      },
    ],
  },

  {
    id: 'estate.bookmark.create',
    title: 'Estate: Create Bookmark',
    shortTitle: 'Create a persistent code bookmark with context, notes, and metadata',

    icon: '$(bookmark)',
    category: 'Bookmarks',

    enablement: 'editorTextFocus',

    menus: [
      {
        menu: 'editor/context',
        when: 'editorTextFocus',
        group: 'estate.bookmarks',
      },
      {
        menu: 'editor/title/context',
        when: 'editorTextFocus',
        group: 'estate.bookmarks',
      },
    ],

    keybindings: [
      {
        key: 'ctrl+alt+b',
        when: 'editorTextFocus',
      },
    ],
  },

  {
    id: 'estate.pipeline.inspect',
    title: 'Estate: Inspect Pipeline Stage',
    shortTitle: 'Open the pipeline graph and inspect transformations between stages',

    icon: '$(graph)',
    category: 'Pipeline',

    enablement: 'estate.pipelineAvailable',

    menus: [
      {
        menu: 'view/item/context',
        when: 'view == estatePipelineTree',
        group: 'inline',
      },
      {
        menu: 'view/title',
        when: 'view == estatePipelineTree',
        group: 'navigation',
      },
    ],

    keybindings: [
      {
        key: 'ctrl+alt+p',
        when: 'estate.pipelineAvailable',
      },
    ],
  },

  {
    id: 'estate.open.documentation',
    title: 'Estate: Open Documentation',
    shortTitle: 'Open command documentation and implementation references',

    icon: '$(book)',
    category: 'Help',

    menus: [
      {
        menu: 'commandPalette',
        group: 'estate',
      },
    ],
  },
];

interface CommandDefinition {
  id: string;
  title: string;
  shortTitle?: string;
  icon?: string;
  category?: string;
  docs?: {
    path: string;
    anchors?: string[];
  };
  implementation?: {
    file: string;
    symbol?: string;
  };
  enablement?: string;
  menus?: MenuContribution[];
  keybindings?: Keybinding[];
}
interface MenuContribution {
  menu:
    | 'view/title'
    | 'view/item/context'
    | 'editor/context'
    | 'editor/title'
    | 'editor/title/context';

  when?: string;
  group?: string;
}

import fs from 'node:fs';
import path from 'node:path';

import { COMMANDS } from './command-registry';

interface PackageContributes {
  commands: Array<{
    command: string;
    title: string;
    category?: string;
    icon?: string;
    enablement?: string;
  }>;

  menus: Record<
    string,
    Array<{
      command: string;
      when?: string;
      group?: string;
    }>
  >;

  keybindings: Array<{
    command: string;
    key: string;
    when?: string;
  }>;
}

export function generatePackageContributes(commands: CommandDefinition[]) {
  return {
    commands: commands.map((cmd) => ({
      command: cmd.id,
      title: cmd.title,

      ...(cmd.shortTitle && {
        shortTitle: cmd.shortTitle,
      }),

      ...(cmd.category && {
        category: cmd.category,
      }),

      ...(cmd.icon && {
        icon: cmd.icon,
      }),

      ...(cmd.enablement && {
        enablement: cmd.enablement,
      }),
    })),

    menus: commands.reduce<Record<string, any[]>>((menus, cmd) => {
      for (const menu of cmd.menus ?? []) {
        menus[menu.menu] ??= [];

        menus[menu.menu].push({
          command: cmd.id,

          ...(menu.when && {
            when: menu.when,
          }),

          ...(menu.group && {
            group: menu.group,
          }),
        });
      }

      return menus;
    }, {}),

    keybindings: commands.flatMap((cmd) =>
      (cmd.keybindings ?? []).map((binding) => ({
        command: cmd.id,
        key: binding.key,

        ...(binding.when && {
          when: binding.when,
        }),
      })),
    ),
  };
}

function generatePackageJson(commands: typeof COMMANDS) {
  return {
    contributes: {
      commands: commands.map((cmd) => ({
        command: cmd.id,
        title: cmd.title,
        category: cmd.category,
        icon: cmd.icon,
      })),

      menus: commands.reduce(
        (acc, cmd) => {
          for (const menu of cmd.menus ?? []) {
            acc[menu.menu] ??= [];

            acc[menu.menu].push({
              command: cmd.id,
              when: menu.when,
              group: menu.group,
            });
          }

          return acc;
        },
        {} as Record<string, unknown[]>,
      ),

      keybindings: commands.flatMap((cmd) =>
        (cmd.keybindings ?? []).map((binding) => ({
          command: cmd.id,
          key: binding.key,
          when: binding.when,
        })),
      ),
    },
  };
}

function generateCommandConstants(commands: typeof COMMANDS) {
  const tree: Record<string, any> = {};

  for (const cmd of commands) {
    const parts = cmd.id.split('.');

    let cursor = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (i === parts.length - 1) {
        cursor[part] = cmd.id;
      } else {
        cursor[part] ??= {};
        cursor = cursor[part];
      }
    }
  }

  function emit(obj: Record<string, any>, indent = 2): string {
    const spaces = ' '.repeat(indent);

    const lines = ['{'];

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        lines.push(`${spaces}${key}: "${value}",`);
      } else {
        lines.push(`${spaces}${key}: ${emit(value, indent + 2)},`);
      }
    }

    lines.push(' '.repeat(indent - 2) + '}');

    return lines.join('\n');
  }

  return ['// GENERATED FILE', '', 'export const CMD = ', emit(tree), ' as const;', ''].join('\n');
}

function generateDocs(commands: typeof COMMANDS) {
  return commands
    .map((cmd) => {
      return `
# ${cmd.title}

Command:

\`${cmd.id}\`

${cmd.shortTitle ?? ''}

Category:
${cmd.category ?? ''}

Documentation:
${cmd.docs?.path ?? 'none'}

Implementation:
${cmd.implementation?.file ?? 'none'}

Menus:
${(cmd.menus ?? []).map((m) => `- ${m.menu}`).join('\n')}

---
`;
    })
    .join('\n');
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true,
  });

  fs.writeFileSync(file, content);
}

export function syncCommands() {
  const root = process.cwd();

  const contributes = generatePackageContributes(COMMAND_NAMES);

  //
  // VS Code package.json contributes section
  //
  write(
    path.join(root, 'generated/package.contributes.json'),
    JSON.stringify(
      {
        contributes,
      },
      null,
      2,
    ),
  );

  //
  // Typed command constants
  //
  write(path.join(root, 'generated/cmd.ts'), generateCommandConstants(COMMANDS));

  //
  // Command documentation index
  //
  write(path.join(root, 'generated/commands.md'), generateDocs(COMMANDS));
}

syncCommands();
