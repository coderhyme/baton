import type { AgentType } from "./state.js";

export interface ExecuteOptions {
  jsonSchema?: string;
}

export interface CLIAgent {
  readonly type: AgentType;
  sessionId?: string;
  execute(prompt: string, options?: ExecuteOptions): Promise<string>;
  initSession(): Promise<void>;
}
