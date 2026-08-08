import os from "node:os";
import path from "node:path";

export const estateDirName = `.estate`;
export const registryName = `anchors.json`;

export const estateDirRootPath = path.join(os.homedir(), estateDirName);
export const registryPath = path.join(estateDirRootPath, registryName);

export const cratePath = "/Users/future/KB/project/app/loi/crates/learn";
export const binaryPath = "/Users/future/KB/project/app/loi/target/debug/loi";
export const logLevel = {
  1: "debug",
  2: "info",
  3: "warn",
  4: "error",
} as const;

export const cfg = {
  estateDirName,
  registryName,
  estateDirRootPath,
  registryPath,
  debugActivity: true,
  debugAnalysis: true,
  cratePath,
  binaryPath,
} as const;

export const PATHS = {
  root: () => estateDirRootPath,
  assets: () => path.join(estateDirRootPath, "assets"),
  asset: (filename: string) => path.join(estateDirRootPath, "assets", filename),
  anchors: () => cfg.registryPath,
};
