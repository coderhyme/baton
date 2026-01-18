import { BaseCLIAgent } from "./base.js";
import { getConfig } from "../config.js";
import { PtyTerminal, type Terminal } from "../utils/index.js";
import type { AgentType, ExecuteOptions } from "../types/index.js";

interface CodexJsonItem {
  id: string;
  type: string;
  text?: string;
}

interface CodexJsonResponse {
  type: string;
  item?: CodexJsonItem;
}

export interface CodexAgentOptions {
  nodeId?: string;
  terminal?: Terminal;
}

export class CodexAgent extends BaseCLIAgent {
  readonly type: AgentType = "codex";
  private nodeId?: string;
  private terminal: Terminal;

  constructor(options?: CodexAgentOptions) {
    super();
    this.nodeId = options?.nodeId;
    this.terminal = options?.terminal ?? new PtyTerminal();
  }

  setNodeId(nodeId: string): void {
    this.nodeId = nodeId;
  }

  async initSession(): Promise<void> {
    const { verbose } = getConfig();
    const output = await this.runCodex(["exec", "--skip-git-repo-check", "/status"]);

    const sessionIdMatch = output.match(/session id:\s*([a-f0-9-]+)/i);
    if (!sessionIdMatch) {
      throw new Error("Failed to extract session ID from codex /status output");
    }

    this.sessionId = sessionIdMatch[1];
    if (verbose) {
      console.log(`[${this.nodeId ?? "codex"}] Session initialized: ${this.sessionId}`);
    }
  }

  protected async executeInternal(prompt: string, _options?: ExecuteOptions): Promise<string> {
    if (!this.sessionId) {
      await this.initSession();
    }

    const { verbose } = getConfig();
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--json",
      "resume",
      this.sessionId!,
      prompt,
    ];

    const output = await this.runCodex(args);

    const agentMessage = this.extractAgentMessage(output);
    if (verbose) {
      const prefix = this.nodeId ? `[${this.nodeId}] ` : "";
      console.log(prefix + agentMessage);
    }

    return agentMessage;
  }

  private extractAgentMessage(jsonlOutput: string): string {
    const lines = jsonlOutput.trim().split("\n");
    const messages: string[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line) as CodexJsonResponse;
        if (parsed.type === "item.completed" && parsed.item?.type === "agent_message" && parsed.item.text) {
          messages.push(parsed.item.text);
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    if (messages.length === 0) {
      throw new Error("No agent_message found in codex output");
    }

    return messages.join("\n\n");
  }

  private runCodex(args: string[]): Promise<string> {
    return this.terminal.run("codex", args);
  }
}
