import * as pty from "node-pty";

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  onData?: (data: string) => void;
}

export interface Terminal {
  run(command: string, args: string[], options?: RunOptions): Promise<string>;
}

export interface PtyTerminalOptions {
  cols?: number;
  rows?: number;
}

export class PtyTerminal implements Terminal {
  // eslint-disable-next-line no-control-regex
  private static readonly ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

  private cols: number;
  private rows: number;

  constructor(options?: PtyTerminalOptions) {
    this.cols = options?.cols ?? 120;
    this.rows = options?.rows ?? 30;
  }

  private stripAnsi(str: string): string {
    return str.replace(PtyTerminal.ANSI_REGEX, "");
  }

  run(command: string, args: string[], options?: RunOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = "";

      const ptyProcess = pty.spawn(command, args, {
        name: "xterm-color",
        cols: this.cols,
        rows: this.rows,
        cwd: options?.cwd ?? process.cwd(),
        env: options?.env ?? (process.env as Record<string, string>),
      });

      ptyProcess.onData((data) => {
        output += data;
        options?.onData?.(data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (exitCode === 0) {
          resolve(this.stripAnsi(output));
        } else {
          reject(new Error(`Process exited with code ${exitCode}`));
        }
      });
    });
  }
}
