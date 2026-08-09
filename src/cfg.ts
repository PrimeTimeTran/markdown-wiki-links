import os from "node:os";
import path from "node:path";

export const estateDirName = `.estate`;
export const registryName = `anchors.json`;

export const estateDirRootPath = path.join(os.homedir(), estateDirName);
export const registryPath = path.join(estateDirRootPath, registryName);

export const cratePath = "/Users/future/KB/project/crates/estate-engine";
export const binaryPath = "/Users/future/KB/project/target/debug/estate-engine";

export const Level = {
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
} as const;
export interface TraceLocation {
  file: string;
  line: number;
  column?: number;
}
export function formatTraceLocation(location: TraceLocation): string {
  const { file, line, column } = location;
  return column === undefined ? `${file}:${line}` : `${file}:${line}:${column}`;
}
export type TraceLevel = (typeof Level)[keyof typeof Level];
export interface TracerOptions {
  namespaces?: string[];
}
const ansi = {
  reset: "\x1b[0m",
  debug: "\x1b[38;2;150;150;150m",
  info: "\x1b[38;2;80;180;255m",
  warn: "\x1b[38;2;255;190;70m",
  error: "\x1b[38;2;255;80;80m",
  caller: "\x1b[38;2;100;100;100m",
};
export class Tracer {
  private static nextFlowId = 1;

  private color(level: TraceLevel): string {
    switch (level) {
      case Level.debug:
        return ansi.debug;
      case Level.info:
        return ansi.info;
      case Level.warn:
        return ansi.warn;
      case Level.error:
        return ansi.error;
    }
  }

  constructor(
    private readonly level: TraceLevel = Level.debug,
    private readonly channel = cfg.appName,
    private readonly options: TracerOptions = {},
    private readonly prefix?: string,
  ) {}

  namespace(namespace: string): Tracer {
    const prefix = this.prefix ? `${this.prefix}.${namespace}` : namespace;

    return new Tracer(this.level, this.channel, this.options, prefix);
  }

  private isNamespaceEnabled(): boolean {
    const namespaces = this.options.namespaces;

    if (!namespaces?.length) {
      return true;
    }

    const prefix = this.prefix;

    if (!prefix) {
      return true;
    }

    return namespaces.some((namespace) => {
      return (
        prefix === namespace ||
        prefix.startsWith(`${namespace}.`) ||
        prefix.endsWith(`.${namespace}`)
      );
    });
  }

  // private getCaller(): string | undefined {
  //   const stack = new Error().stack;

  //   if (!stack) return;

  //   const lines = stack.split("\n");

  //   for (const line of lines.slice(1)) {
  //     // Skip Tracer / TraceFlow internals.
  //     if (line.includes("Tracer.") || line.includes("TraceFlow.")) {
  //       continue;
  //     }

  //     const caller = this.parseCaller(line);

  //     if (caller) {
  //       return caller;
  //     }
  //   }

  //   return;
  // }

  // private parseCaller(line: string): string | undefined {
  //   // Node/V8:
  //   // at foo (/path/file.ts:12:34)
  //   // at /path/file.ts:12:34
  //   const match = line.match(/(?:\()?(.*:\d+:\d+)\)?$/);

  //   return match?.[1];
  // }
  // trace(event: string, data?: unknown, level: TraceLevel = Level.debug): void {
  //   if (level < this.level) return;
  //   if (!this.isNamespaceEnabled()) return;

  //   const caller = this.getCaller();

  //   const tag = this.prefix ? `[${this.prefix}.${event}]` : `[${event}]`;
  //   // const tag = this.prefix
  //   //   ? `[${this.channel}] [${this.prefix}.${event}]`
  //   //   : `[${this.channel}] [${event}]`;

  //   const message = `${this.color(level)}${tag}${ansi.reset}`;

  //   console.log(message, data ?? "");

  //   if (caller) {
  //     console.log(`${ansi.caller}${caller}${ansi.reset}`);
  //   }
  // }
  trace(event: string, data?: unknown, level: TraceLevel = Level.debug): void {
    if (level < this.level) return;
    if (!this.isNamespaceEnabled()) return;

    const caller = this.getCaller();
    // const tag = this.prefix
    //   ? `[${this.channel}] [${this.prefix}.${event}]`
    //   : `[${this.channel}] [${event}]`;
    const tag = this.prefix ? `[${this.prefix}.${event}]` : `[${event}]`;

    const message = `${this.color(level)}${tag}${ansi.reset}`;

    console.log(message, data ?? "");

    if (caller) {
      console.log(caller);
    }
  }
  private getCaller(): string | undefined {
    const stack = new Error().stack;

    if (!stack) return;

    for (const line of stack.split("\n").slice(1)) {
      if (line.includes("Tracer.") || line.includes("TraceFlow.")) {
        continue;
      }

      const caller = this.parseCaller(line);

      if (!caller) {
        continue;
      }

      const lines = [
        caller.functionName
          ? `${ansi.caller}    at ${caller.functionName}${ansi.reset}`
          : undefined,

        `${ansi.caller}    in ${caller.location}${ansi.reset}`,
      ];

      return lines.filter(Boolean).join("\n");
    }

    return;
  }
  private parseCaller(line: string): { functionName?: string; location: string } | undefined {
    const match = line.match(/^\s*at (?:(.*?) \()?(.+:\d+:\d+)\)?$/);

    if (!match) {
      return;
    }

    return {
      functionName: match[1],
      location: match[2],
    };
  }
  flow(name: string): TraceFlow {
    return new TraceFlow(this, Tracer.nextFlowId++, name);
  }

  debug(event: string, data?: unknown): void {
    this.trace(event, data, Level.debug);
  }

  info(event: string, data?: unknown): void {
    this.trace(event, data, Level.info);
  }

  warn(event: string, data?: unknown): void {
    this.trace(event, data, Level.warn);
  }

  error(event: string, data?: unknown): void {
    this.trace(event, data, Level.error);
  }
}
export class TraceFlow {
  private count = 0;
  constructor(
    private readonly tracer: Tracer,
    private readonly id: number,
    private readonly name: string,
  ) {}
  trace(event: string, data?: unknown, level: TraceLevel = Level.debug): void {
    this.count++;

    this.tracer.trace(`[${this.name}#${this.id}:${this.count}] ${event}`, data, level);
  }
  debug(event: string, data?: unknown): void {
    this.trace(event, data, Level.debug);
  }

  info(event: string, data?: unknown): void {
    this.trace(event, data, Level.info);
  }

  warn(event: string, data?: unknown): void {
    this.trace(event, data, Level.warn);
  }

  error(event: string, data?: unknown): void {
    this.trace(event, data, Level.error);
  }
}

export const PATHS = {
  root: () => estateDirRootPath,
  assets: () => path.join(estateDirRootPath, "assets"),
  asset: (filename: string) => path.join(estateDirRootPath, "assets", filename),
  anchors: () => cfg.registryPath,
};

export const cfg = {
  appName: "Flowify",
  estateDirName,
  registryName,
  estateDirRootPath,
  registryPath,
  debugActivity: true,
  debugAnalysis: true,
  cratePath,
  binaryPath,
} as const;
