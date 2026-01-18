import { spawn } from "node:child_process";
import { BaseCLIAgent } from "./base.js";
import { getConfig } from "../config.js";
import type { AgentType, ExecuteOptions } from "../types/index.js";

interface GeminiJsonResponse {
  session_id: string;
  response: string;
}

export interface GeminiAgentOptions {
  nodeId?: string;
}

export class GeminiAgent extends BaseCLIAgent {
  readonly type: AgentType = "gemini";
  private nodeId?: string;

  constructor(options?: GeminiAgentOptions) {
    super();
    this.nodeId = options?.nodeId;
  }

  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  async initSession(): Promise<void> {
    const { verbose } = getConfig();
    const result = await this.runGemini("Hello");

    this.sessionId = result.session_id;
    if (verbose) {
      console.log(`[${this.nodeId ?? "gemini"}] Session initialized: ${this.sessionId}`);
    }
  }

  protected async executeInternal(prompt: string, _options?: ExecuteOptions): Promise<string> {
    const { verbose } = getConfig();
    const result = await this.runGemini(prompt);

    if (!this.sessionId) {
      this.sessionId = result.session_id;
    }

    if (verbose) {
      const prefix = this.nodeId ? `[${this.nodeId}] ` : "";
      console.log(prefix + result.response);
    }

    return result.response;
  }

  private runGemini(prompt: string): Promise<GeminiJsonResponse> {
    return new Promise((resolve, reject) => {
      const args: string[] = ["-o=json"];

      if (this.sessionId) {
        args.push("-r", this.sessionId);
      }

      args.push(prompt);

      const child = spawn("gemini", args, {
        stdio: ["inherit", "pipe", "inherit"],
        env: { ...process.env },
      });

      let stdout = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout.trim()) as GeminiJsonResponse;
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Failed to parse Gemini JSON output: ${error}`));
          }
        } else {
          reject(new Error(`Gemini CLI exited with code ${code}`));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to spawn Gemini CLI: ${error.message}`));
      });
    });
  }
}
