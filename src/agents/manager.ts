import { ClaudeAgent } from "./claude.js";
import {
  getStateMachineGenerationPrompt,
  SYNTHESIS_PROMPT_TEMPLATE,
  getStateMachineJsonSchema,
} from "../prompts/manager.js";
import { createStateMachineSchemaDefinition, type StateMachineSchema } from "../types/index.js";

export class ManagerAgent {
  private agent: ClaudeAgent;

  constructor() {
    this.agent = new ClaudeAgent();
  }

  async initSession(): Promise<void> {
    await this.agent.initSession();
  }

  async generateStateMachine(userPrompt: string): Promise<StateMachineSchema> {
    const prompt = getStateMachineGenerationPrompt();
    const fullPrompt = prompt + userPrompt;
    const jsonSchema = getStateMachineJsonSchema();

    const response = await this.agent.execute(fullPrompt, {
      jsonSchema,
    });

    const parsed = JSON.parse(response);
    const schema = createStateMachineSchemaDefinition();
    const validated = schema.parse(parsed) as StateMachineSchema;

    console.log("\n## Execution Plan\n");
    console.log(validated.plan);
    console.log("\n## State Machine Diagram\n");
    console.log(validated.diagram);
    console.log("");

    return validated;
  }

  async synthesize(
    originalPrompt: string,
    nodeOutputs: Record<string, string>
  ): Promise<string> {
    const outputsText = Object.entries(nodeOutputs)
      .map(([nodeId, output]) => `### ${nodeId}:\n${output}`)
      .join("\n\n");

    const synthesisPrompt = SYNTHESIS_PROMPT_TEMPLATE
      .replace("{{nodeOutputs}}", outputsText)
      .replace("{{originalPrompt}}", originalPrompt);

    return this.agent.execute(synthesisPrompt);
  }
}
