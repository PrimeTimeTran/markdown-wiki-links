import { EstateFlag } from '../src/estate';

const COMMANDS = [
  {
    command: 'refPanel.open',
    title: 'Estate: Open Reference Panel',
  },
  {
    command: 'anchor.create',
    title: 'Estate: Create Anchor',
  },
  {
    command: 'anchor.read',
    title: 'Estate: Read Anchor',
  },
  {
    command: 'anchor.update',
    title: 'Estate: Update Anchor',
  },
  {
    command: 'anchor.delete',
    title: 'Estate: Delete Anchor',
  },
  {
    command: 'anchor.open',
    title: 'Estate: Open Anchor',
  },
  {
    command: 'anchor.present',
    title: 'Estate: Present Anchor',
  },
  {
    command: 'estate.snippet-maker',
    title: 'Estate: Snippet Maker',
  },
  {
    command: 'wikiLinks.rebuildIndex',
    title: 'Wiki Links: Rebuild Index',
  },
  {
    command: 'ui.toggleMDPreview',
    title: 'Wiki Links: Preview Mode (Toggle)',
  },
  {
    command: 'flowify.analyzeLine',
    title: 'Estate: Analyze Subject',
  },
];

function printCmds() {
  const groups = {};

  for (const { command } of COMMANDS) {
    const [prefix, name] = command.split('.');

    if (!groups[prefix]) {
      groups[prefix] = {};
    }

    groups[prefix][name] = command;
  }

  console.log(
    'export const CMD = ' +
      JSON.stringify(groups, null, 2).replace(/"([^"]+)":/g, '$1:') +
      ' as const;',
  );
}

export const CMD = {
  estate: {
    anchor: 'anchor.pipeline',
    refresh: 'estate.refresh',
  },
  anchor: {
    create: 'anchor.create',
    read: 'anchor.read',
    update: 'anchor.update',
    delete: 'anchor.delete',
    open: 'anchor.open',
    present: 'anchor.present',
    edit: 'anchor.edit',
  },

  refPanel: {
    open: 'refPanel.open',
    register: 'refPanel.register',
    test: 'refPanel.test',
  },
} as const;

export const capability: EstateFlag[] = [
  {
    id: '@easy',
    label: 'Easy',
    description: 'Easy',
    scope: 'language',
    capabilities: [],
    action: 'estate.easy',
  },
  {
    id: '@medium',
    label: 'Medium',
    description: 'Medium',
    scope: 'language',
    capabilities: [],
    action: 'estate.medium',
  },
  {
    id: '@hard',
    label: 'Hard',
    description: 'Hard',
    scope: 'language',
    capabilities: [],
    action: 'estate.hard',
  },
];
export const flags: EstateFlag[] = [
  {
    id: '@save',
    label: 'Save',
    description: 'Save',
    scope: 'language',
    capabilities: [],
    action: 'estate.save',
  },
  {
    id: '@capture',
    label: 'Capture',
    description: 'Capture',
    scope: 'language',
    capabilities: [],
    action: 'wiki.click',
  },
  {
    id: '@note',
    label: 'Note',
    description: 'Note...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@fold',
    label: 'Fold',
    description: 'Fold....',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@preserve',
    label: 'Preserve',
    description: 'Preserve...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@option',
    label: 'Option',
    description: 'Option...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@inline',
    label: 'Inline',
    description: 'Inline...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@context',
    label: 'Option',
    description: 'Option...',
    scope: 'language',
    capabilities: [],
    action: 'ui.openInNewEditorGroup',
  },
  {
    id: '@connected',
    label: 'Connected',
    description: 'Connected...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@branch',
    label: 'Branch',
    description: 'Branch...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.branch',
  },
  {
    id: '@hoverable',
    label: 'Hoverable',
    description: 'Hoverable...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.hoverable',
  },
  {
    id: '@pinnable',
    label: 'Pinnable',
    description: 'Pinnable...',
    capabilities: [],
    scope: 'language',
    action: 'ui.pinnable',
  },
  {
    id: '@pick',
    label: 'Pick',
    description: 'Pick...',
    scope: 'language',
    capabilities: [],
    action: 'wiki.ui.pick',
  },
];
export const flag = [
  {
    id: '@save',
    label: 'Save',
    description: 'Save',
    scope: 'language',
    action: 'wiki.click',
  },
  {
    id: '@capture',
    label: 'Capture',
    description: 'Capture',
    scope: 'language',
    action: 'wiki.click',
  },
  {
    id: '@note',
    label: 'Note',
    description: 'Note...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@fold',
    label: 'Fold',
    description: 'Fold....',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@preserve',
    label: 'Preserve',
    description: 'Preserve...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@option',
    label: 'Option',
    description: 'Option...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@inline',
    label: 'Inline',
    description: 'Inline...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@context',
    label: 'Option',
    description: 'Option...',
    scope: 'language',
    action: 'ui.openInNewEditorGroup',
  },
  {
    id: '@connected',
    label: 'Connected',
    description: 'Connected...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@branch',
    label: 'Branch',
    description: 'Branch...',
    scope: 'language',
    action: 'wiki.branch',
  },
  {
    id: '@hoverable',
    label: 'Hoverable',
    description: 'Hoverable...',
    scope: 'language',
    action: 'wiki.hoverable',
  },
  {
    id: '@pinnable',
    label: 'Pinnable',
    description: 'Pinnable...',
    scope: 'language',
    action: 'ui.pinnable',
  },
  {
    id: '@pick',
    label: 'Pick',
    description: 'Pick...',
    scope: 'language',
    action: 'wiki.ui.pick',
  },
];
