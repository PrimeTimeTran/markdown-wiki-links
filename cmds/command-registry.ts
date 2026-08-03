import fs from 'node:fs';
import path from 'node:path';

import type { CommandDefinition } from './command-schema';

export const COMMANDS: CommandDefinition[] = [
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
  const lines = ['// GENERATED FILE', '', 'export const CMD = {'];

  for (const cmd of commands) {
    const name = cmd.id
      .replace(/^estate\./, '')
      .split('.')
      .map((x) => x.replace(/^./, (c) => c.toUpperCase()))
      .join('');

    lines.push(`  ${name}: "${cmd.id}",`);
  }

  lines.push('};', '');

  return lines.join('\n');
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

  //
  // package.json fragment
  //
  write(
    path.join(root, 'generated/package.contributes.json'),
    JSON.stringify(generatePackageJson(COMMANDS), null, 2),
  );

  //
  // typed command constants
  //
  write(path.join(root, 'generated/cmd.ts'), generateCommandConstants(COMMANDS));

  //
  // docs index
  //
  write(path.join(root, 'generated/commands.md'), generateDocs(COMMANDS));
}

syncCommands();
