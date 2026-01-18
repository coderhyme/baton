import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { BaseCLIAgent } from "./base.js";
import { getConfig } from "../config.js";
import type { AgentType, ExecuteOptions } from "../types/index.js";

interface ClaudeJsonResponse {
  result: string;
  structured_output?: unknown;
}

export interface ClaudeAgentOptions {
  nodeId?: string;
}

export class ClaudeAgent extends BaseCLIAgent {
  readonly type: AgentType = "claude";
  private nodeId?: string;
  private sessionStarted = false;

  constructor(options?: ClaudeAgentOptions) {
    super();
    this.nodeId = options?.nodeId;
  }

  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  async initSession(): Promise<void> {
    this.sessionId = randomUUID();
    if (getConfig().verbose) {
      console.log(`[${this.nodeId ?? "agent"}] Session initialized: ${this.sessionId}`);
    }
  }

  protected async executeInternal(prompt: string, options?: ExecuteOptions): Promise<string> {
    if (!this.sessionId) {
      await this.initSession();
    }

    const { verbose } = getConfig();
    const response = await this.runClaude(prompt, {
      outputJson: !!options?.jsonSchema,
      jsonSchema: options?.jsonSchema,
      streaming: verbose && !options?.jsonSchema,
    });

    if (options?.jsonSchema) {
      const parsed = JSON.parse(response) as ClaudeJsonResponse;
      // When using --json-schema, the structured output is in structured_output field
      if (parsed.structured_output !== undefined) {
        return JSON.stringify(parsed.structured_output);
      }
      return parsed.result;
    }

    return response;
  }

  private runClaude(
    prompt: string,
    options: { outputJson: boolean; jsonSchema?: string; streaming: boolean }
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];

      if (this.sessionId) {
        if (this.sessionStarted) {
          args.push("-r", this.sessionId);
        } else {
          args.push("--session-id", this.sessionId);
        }
      }

      args.push("-p");

      if (options.outputJson) {
        args.push("--output-format", "json");
      } else {
        args.push("--output-format", "text");
      }

      if (options.jsonSchema) {
        args.push("--json-schema", options.jsonSchema);
      }

      args.push(prompt);

      const child = spawn("claude", args, {
        stdio: ["inherit", "pipe", "inherit"],
        env: { ...process.env },
      });

      let stdout = "";
      const prefix = this.nodeId ? `[${this.nodeId}] ` : "";

      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (options.streaming) {
          process.stdout.write(prefix + chunk);
        }
      });

      child.on("close", (code) => {
        if (options.streaming && stdout && !stdout.endsWith("\n")) {
          process.stdout.write("\n");
        }
        if (code === 0) {
          this.sessionStarted = true;
          resolve(stdout.trim());
        } else {
          reject(new Error(`Claude CLI exited with code ${code}`));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });
    });
  }
}
