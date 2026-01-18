import { mkdir, readFile, writeFile } from "node:fs/promises";
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

interface ParsedArgs {
  prompt: string;
  verbose: boolean;
  file: string | null;
}

function parseArgs(args: string[]): ParsedArgs {
  let verbose = false;
  let file: string | null = null;
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-v" || arg === "--verbose") {
      verbose = true;
    } else if (arg === "-f" || arg === "--file") {
      file = args[++i] ?? null;
    } else {
      promptParts.push(arg);
    }
  }

  return {
    prompt: promptParts.join(" "),
    verbose,
    file,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npx tsx src/index.ts [-v|--verbose] [-f|--file <path>] \"<your prompt>\"");
    console.log("");
    console.log("Options:");
    console.log("  -v, --verbose       Show realtime agent output");
    console.log("  -f, --file <path>   Read prompt from file");
    console.log("");
    console.log("Examples:");
    console.log("  npx tsx src/index.ts -v \"Explain the concept of recursion\"");
    console.log("  npx tsx src/index.ts -f prompt.txt");
    process.exit(1);
  }

  const { prompt: argPrompt, verbose, file } = parseArgs(args);
  initConfig({ ...(verbose ? { verbose } : {}) });

  if (file && argPrompt) {
    console.error("Error: Cannot use both --file and prompt argument");
    process.exit(1);
  }

  let prompt: string;
  if (file) {
    try {
      prompt = (await readFile(file, "utf-8")).trim();
    } catch (error) {
      console.error(`Error: Failed to read file "${file}":`, error);
      process.exit(1);
    }
  } else {
    prompt = argPrompt;
  }

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
