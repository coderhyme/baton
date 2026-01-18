import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ManagerAgent, ClaudeAgent, CodexAgent, GeminiAgent } from "./agents/index.js";
import { buildGraph, executeGraph } from "./graph/index.js";
import { initConfig } from "./config.js";
import type { CLIAgent, AgentType, StateMachineSchema } from "./types/index.js";

function createAgentPool(schema: StateMachineSchema): Map<string, CLIAgent> {
  const pool = new Map<string, CLIAgent>();

  for (const node of schema.nodes) {
    const agent = createAgent(node.agentType, node.id);
    pool.set(node.id, agent);
  }

  return pool;
}

function createAgent(type: AgentType, nodeId: string): CLIAgent {
  switch (type) {
    case "claude":
      return new ClaudeAgent({ nodeId });
    case "codex":
      return new CodexAgent({ nodeId });
    case "gemini":
      return new GeminiAgent({ nodeId });
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}

async function initializeAgentPool(pool: Map<string, CLIAgent>): Promise<void> {
  const initPromises = Array.from(pool.values()).map((agent) =>
    agent.initSession()
  );
  await Promise.all(initPromises);
}

interface RunState {
  runId: string;
  timestamp: string;
  prompt: string;
  schema: StateMachineSchema;
  agents: Array<{
    nodeId: string;
    type: AgentType;
    sessionId: string | undefined;
  }>;
}

async function saveRunState(
  runId: string,
  prompt: string,
  schema: StateMachineSchema,
  agentPool: Map<string, CLIAgent>
): Promise<string> {
  const runDir = join(process.cwd(), ".baton", runId);
  await mkdir(runDir, { recursive: true });

  const agents = Array.from(agentPool.entries()).map(([nodeId, agent]) => ({
    nodeId,
    type: agent.type,
    sessionId: agent.sessionId,
  }));

  const state: RunState = {
    runId,
    timestamp: new Date().toISOString(),
    prompt,
    schema,
    agents,
  };

  await writeFile(
    join(runDir, "state.json"),
    JSON.stringify(state, null, 2)
  );

  return runDir;
}

export async function orchestrate(userPrompt: string): Promise<string> {
  console.log("Initializing Manager agent...");
  const manager = new ManagerAgent();
  await manager.initSession();

  console.log("Generating state machine schema...");
  const schema = await manager.generateStateMachine(userPrompt);
  console.log("Generated schema:", JSON.stringify(schema, null, 2));

  console.log("Creating and initializing agent pool...");
  const agentPool = createAgentPool(schema);
  await initializeAgentPool(agentPool);

  const runId = randomUUID();
  const runDir = await saveRunState(runId, userPrompt, schema, agentPool);
  console.log(`Run state saved to: ${runDir}`);

  console.log("Building and executing graph...");
  const { compiled, initialMetadata } = buildGraph(schema, agentPool);
  const result = await executeGraph(compiled, {
    prompt: userPrompt,
    metadata: initialMetadata,
  });

  if (result.error) {
    console.error("Execution error:", result.error);
  }

  return result.finalAnswer;
}

function parseArgs(args: string[]): { prompt: string; verbose: boolean } {
  let verbose = false;
  const promptParts: string[] = [];

  for (const arg of args) {
    if (arg === "-v" || arg === "--verbose") {
      verbose = true;
    } else {
      promptParts.push(arg);
    }
  }

  return {
    prompt: promptParts.join(" "),
    verbose,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npx tsx src/index.ts [-v|--verbose] \"<your prompt>\"");
    console.log("");
    console.log("Options:");
    console.log("  -v, --verbose    Show realtime agent output");
    console.log("");
    console.log("Example: npx tsx src/index.ts -v \"Explain the concept of recursion\"");
    process.exit(1);
  }

  const { prompt, verbose } = parseArgs(args);
  initConfig({ ...(verbose ? { verbose } : {}) });

  if (!prompt) {
    console.error("Error: No prompt provided");
    process.exit(1);
  }

  console.log(`\nOrchestrating prompt: "${prompt}"`);
  if (verbose) {
    console.log("Verbose mode: enabled\n");
  } else {
    console.log("");
  }

  try {
    const result = await orchestrate(prompt);
    console.log("\n=== Final Answer ===\n");
    console.log(result);
  } catch (error) {
    console.error("Orchestration failed:", error);
    process.exit(1);
  }
}

main();
