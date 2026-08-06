import os from "node:os";
import path from "node:path";

export const cratePath = "/Users/future/KB/project/app/loi/crates/learn";
export const binaryPath = "/Users/future/KB/project/app/loi/target/debug/loi";

export const logLevel = {
  1: "debug",
  2: "info",
  3: "warn",
  4: "error",
};

export const cfg = {
  debugActivity: true,
  debugAnalysis: true,
  cratePath,
  binaryPath,
};

const ESTATE_DIR = path.join(os.homedir(), ".estate");

export const PATHS = {
  root: () => ESTATE_DIR,
  assets: () => path.join(ESTATE_DIR, "assets"),
  asset: (filename: string) => path.join(ESTATE_DIR, "assets", filename),
  anchors: () => path.join(ESTATE_DIR, "anchorsp.json"),
};
