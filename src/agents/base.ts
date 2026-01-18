import type { AgentType, CLIAgent, ExecuteOptions } from "../types/index.js";

export abstract class BaseCLIAgent implements CLIAgent {
  abstract readonly type: AgentType;
  sessionId?: string;
  private maxRetries = 1;

  abstract initSession(): Promise<void>;
  protected abstract executeInternal(prompt: string, options?: ExecuteOptions): Promise<string>;

  async execute(prompt: string, options?: ExecuteOptions): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeInternal(prompt, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          console.log(`Attempt ${attempt + 1} failed, retrying...`);
        }
      }
    }

    throw lastError ?? new Error("Unknown execution error");
  }
}
