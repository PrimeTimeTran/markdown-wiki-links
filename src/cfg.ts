import os from 'node:os';
import path from 'node:path';

const ESTATE_DIR = path.join(os.homedir(), '.estate');

export const PATHS = {
  root: () => ESTATE_DIR,
  assets: () => path.join(ESTATE_DIR, 'assets'),
  asset: (filename: string) => path.join(ESTATE_DIR, 'assets', filename),
  anchors: () => path.join(ESTATE_DIR, 'anchors.json'),
};
