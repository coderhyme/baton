# Baton

> *Conduct your AI orchestra*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![LangGraph](https://img.shields.io/badge/Powered%20by-LangGraph-orange.svg)](https://langchain-ai.github.io/langgraphjs/)
[![Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)]()

> **Warning**: This project is in an **experimental stage**.

A TypeScript CLI tool that coordinates multiple AI agents (Claude, Codex, Gemini) using LangGraph state machines. It automatically breaks down complex tasks into step-by-step workflows, delegating subtasks to specialized AI agents based on their strengths.

## About the Name

**Baton** — the conductor's instrument for directing an orchestra.

This name was selected through a collaborative brainstorming process where three AI agents (Claude, Codex, and Gemini) evaluated candidate names together.

### Why "Baton"?

- **Perfect metaphor** — The baton is the conductor's instrument for directing an orchestra. This project conducts multiple AI "performers" (Claude, Codex, Gemini) through a coordinated workflow. Unlike "Maestro" which describes the person, "Baton" represents the tool.
- **Distinctive** — Not overused in the tech/orchestration space, unlike Maestro (AWS) or Relay (Meta GraphQL).
- **Practical** — Short (5 letters), easy to spell and pronounce globally, works as npm package, CLI command, and GitHub repo name.
- **Memorable** — Developers can immediately visualize a conductor's baton directing performers.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Agent Selection Guide](#agent-selection-guide)
- [Troubleshooting](#troubleshooting)
- [Debugging](#debugging)
- [Limitations](#limitations)
- [API Reference](#api-reference)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Dynamic Task Planning** — A Manager agent (currently Claude) analyzes prompts and auto-generates state machine workflows
- **Multi-Agent Orchestration** — Coordinates `claude`, `codex`, and `gemini` CLI tools as worker nodes
- **State Machine Execution** — Powered by [LangGraph](https://langchain-ai.github.io/langgraphjs/) for robust, stateful workflows with parallel/conditional execution
- **Per-Node Agent Instances** — Each node gets its own dedicated agent instance that maintains session context within a single run
- **Conditional Branching** — Edges support JavaScript conditions for dynamic routing
- **Two-Layer Retry Logic** — Graph-level retries via `maxRetries` (default: 0) plus internal agent-level retries (1 retry) for transient failures
- **Run State Logging** — Each execution is saved to `.baton/<runId>/state.json`

## Prerequisites

**Required:** Node.js 18+ (uses ESM modules and modern APIs)

This tool coordinates existing CLI agents—it does not include or replace them.

| Tool | Best For | Required | Installation | Verification |
|------|----------|----------|--------------|--------------|
| **Claude CLI** | Planning, reasoning, synthesis | Always | [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude --version` |
| **Codex CLI** | Code generation, editing | If in config | See CLI Compatibility below | `codex --version` |
| **Gemini CLI** | General knowledge, verification | If in config | See CLI Compatibility below | `gemini --version` |

**Important Notes:**

- Claude CLI is always required as it powers the Manager agent
- Codex and Gemini are only required if listed in your `baton.config.yaml` `agents` array
- Each CLI tool must be authenticated with valid API credentials
- **When no config file exists, the default includes all three agents** — create a Claude-only config for first-time setup (see Quick Start)

> **CLI Compatibility:** This project expects specific CLI interfaces. The `codex` and `gemini` commands are **not bundled**—you must provide CLI tools that implement these interfaces:
>
> | CLI | Expected Command Format | Response Format |
> |-----|------------------------|-----------------|
> | `codex` | `codex exec --skip-git-repo-check /status` | Must output `session id: <uuid>` |
> | `codex` | `codex exec --skip-git-repo-check --json resume <session-id> "<prompt>"` | JSONL with `item.completed` events containing `agent_message` items |
> | `gemini` | `gemini -r <session-id> -o=json "<prompt>"` | JSON with `session_id` and `response` fields |
>
> **Options for getting these CLIs:**
>
> - Use official CLI tools from OpenAI/Google if available in your organization
> - Implement wrapper scripts that translate to your preferred AI CLI tools
> - Modify `src/agents/codex.ts` and `src/agents/gemini.ts` to match your CLI interfaces
>
> If you only have Claude CLI, configure `agents: [claude]` in your config to use Claude for all tasks.

## Quick Start

> **Before starting:** Ensure the [prerequisites](#prerequisites) are installed and authenticated. Running without them will cause "command not found" errors.

```bash
# Clone and install
git clone https://github.com/coderhyme/baton.git
cd baton
npm install

# Create a minimal config (Claude-only to start)
# This is required to avoid errors from missing codex/gemini CLIs
cat > baton.config.yaml << 'EOF'
verbose: false
agents:
  - claude
EOF

# Verify setup
claude --version

# Run your first task
npm run start -- "Write a Python function to calculate fibonacci numbers"
```

The Manager will analyze your request, create an execution plan, and delegate to the appropriate agents based on the task and your configuration.

## Usage

### Basic Execution

Execute a task directly from the command line:

```bash
npm run start -- "Write a Python function that fetches weather data from an API and saves it to CSV"
```

Or read the prompt from a file:

```bash
npm run start -- -f prompt.txt
```

The Manager determines which agents to use based on your config and the task requirements.

### Verbose Mode

See real-time output from the underlying agents:

```bash
npm run start:verbose -- "Refactor src/index.ts to improve error handling"
```

**CLI Arguments:**

| Argument | Description |
|----------|-------------|
| `-v, --verbose` | Show real-time agent output |
| `-f, --file <path>` | Read prompt from file |
| `[prompt]` | The task description for the Manager to plan and execute |

**Note:** You cannot use both `-f` and a prompt argument at the same time.

**Available npm Scripts:**

| Script | Description |
|--------|-------------|
| `npm run start -- "<prompt>"` | Execute a task with default settings |
| `npm run start:verbose -- "<prompt>"` | Execute with verbose output |
| `npm run dev` | Development mode with file watching |

**Example Session (Illustrative):**

The following shows the general structure of output you'll see. Actual schema content and timing will vary based on your prompt:

```text
Orchestrating prompt: "Create a Python script that scrapes Hacker News headlines"
Verbose mode: enabled

Initializing Manager agent...
Generating state machine schema...
Generated schema: {
  "plan": "Multi-step web scraping implementation",
  "nodes": [...],
  "edges": [...],
  ...
}
Creating and initializing agent pool...
Run state saved to: .baton/<runId>
Building and executing graph...

============================================================
[NODE START] plan-impl (Plan Implementation)
  Agent: claude
  Attempt: 1/1
============================================================

------------------------------------------------------------
[NODE END] plan-impl - SUCCESS (2341ms)
------------------------------------------------------------
Output:
I recommend using requests library with BeautifulSoup...
------------------------------------------------------------

=== Final Answer ===

[Final node output appears here]
```

**Error Handling:** If a node fails after exhausting retries, you'll see:

```text
------------------------------------------------------------
[NODE END] write-code - FAILED (15023ms)
------------------------------------------------------------
Error: API timeout after 30s
------------------------------------------------------------

Execution error: Node write-code failed after 2 attempts: API timeout after 30s
```

The error is captured in `ctx.error` for conditional routing to error-handling nodes.

## Configuration

Configuration is managed via `baton.config.yaml` in the project root.

**Complete example** (copy this to get started):

```yaml
# baton.config.yaml

# Enable verbose output (shows real-time agent responses)
verbose: false

# Available agents for orchestration
# The Manager will only use agents listed here
# This also constrains the agentType values in generated schemas
agents:
  - claude    # Always required (powers the Manager)
  - codex     # Optional: for code generation tasks
  - gemini    # Optional: for general knowledge tasks
```

**Minimal example** (Claude only):

```yaml
verbose: false
agents:
  - claude
```

**Configuration Precedence:**

- `verbose`: CLI flag (`-v`) overrides config file, which overrides default (`false`)
- `agents`: Config file only (no CLI flag available)

## Architecture

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Prompt                             │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Manager Agent (Claude)                       │
│  • Analyzes the request                                         │
│  • Generates StateMachineSchema (JSON)                          │
│  • Determines which agents handle which subtasks                │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Graph Builder                             │
│  • Converts schema to LangGraph                                 │
│  • Sets up conditional routing                                  │
│  • Creates node executors with retry logic                      │
└─────────────────────────────┬───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Graph Executor                            │
│  • Invokes LangGraph with initial state                         │
│  • Multiple outgoing edges trigger parallel node execution      │
│  • Returns final output (last entry in nodeOutputs)             │
└─────────────────────────────┬───────────────────────────────────┘
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Claude Agent  │     │ Codex Agent   │     │ Gemini Agent  │
│  (Reasoning)  │     │   (Coding)    │     │   (General)   │
└───────────────┘     └───────────────┘     └───────────────┘
```

### Core Dependencies

| Package | Purpose |
|---------|---------|
| `@langchain/langgraph` | State machine graph construction & execution |
| `@langchain/core` | LangChain foundation types |
| `zod` | Schema validation for state machine definitions |
| `zod-to-json-schema` | Converts Zod schemas to JSON Schema for Claude |
| `yaml` | Config file parsing |
| `node-pty` | Pseudo-terminal for Codex agent (required for session management) |

**Tips:**

- For code-heavy tasks, ensure `codex` is in your agents config
- For pure reasoning/planning tasks, Claude-only config works well
- The Manager's agent selection is non-deterministic—the same prompt may produce different execution plans on different runs

## Troubleshooting

### node-pty issues on macOS

If you encounter errors related to `node-pty`, fix permissions on the prebuilt binaries:

```bash
chmod +x node_modules/**/node-pty/**/prebuilds/darwin-*/spawn-helper
```

### CLI tools not found

If you see `Error: spawn <agent> ENOENT`, the CLI tool is not in your PATH:

```bash
# Verify Claude (always required)
claude --version

# Verify Codex/Gemini only if in your agents config
codex --version   # Only if using codex
gemini --version  # Only if using gemini

# Check PATH
which claude
```

**Tip:** If you only have Claude CLI, use a Claude-only config:

```yaml
agents:
  - claude
```

### Authentication errors

If you see "API key not found" or authentication errors:

- **Claude**: Run `claude` and follow the authentication prompts
- **Codex**: Set up authentication per your Codex CLI documentation
- **Gemini**: Run `gemini` and authenticate with your Google account

### Common runtime errors

| Error Pattern | Cause | Solution |
|---------------|-------|----------|
| `Failed to extract session ID from codex /status output` | Codex `/status` command didn't return expected format | Ensure Codex CLI outputs `session id: <uuid>` on status check |
| `No agent_message found in codex output` | Codex JSONL response missing `agent_message` items | Verify Codex returns `item.completed` events with `agent_message` type |
| `Failed to parse Gemini JSON output: ...` | Gemini CLI returned invalid JSON | Verify Gemini CLI `-o=json` flag produces valid JSON with `session_id` and `response` fields |
| `Gemini CLI exited with code X` | Gemini CLI crashed or returned non-zero | Check Gemini authentication and CLI installation |
| `Claude CLI exited with code X` | Claude CLI crashed or auth issue | Check Claude authentication and API access |
| `Failed to spawn <agent> CLI: ...` | CLI binary not found or not executable | Verify CLI is installed and in PATH (`which <agent>`) |

### Graph execution errors

If a node fails during execution, the error follows this format:

```
Node <nodeId> failed after <attempts> attempts: <error message>
```

When returned as final output, errors are prefixed:

```
Error during execution: Node <nodeId> failed after <attempts> attempts: <error message>
```

The error is stored in `ctx.error` and can be used for conditional routing to error-handling nodes.

## Debugging

### Understanding run state

Each execution saves state to `.baton/<runId>/state.json` **before** graph execution begins. This file captures the initial state:

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "prompt": "Original user prompt",
  "schema": {
    "plan": "Generated execution plan",
    "diagram": "ASCII diagram of workflow",
    "nodes": [...],
    "edges": [...],
    "startNodeId": "plan-impl",
    "endNodeId": "verify"
  },
  "agents": [
    { "nodeId": "plan-impl", "type": "claude", "sessionId": "session-abc123" },
    { "nodeId": "write-code", "type": "codex", "sessionId": "session-def456" },
    { "nodeId": "verify", "type": "gemini", "sessionId": "session-ghi789" }
  ]
}
```

**Note:** This is a pre-execution snapshot. Node outputs (`nodeOutputs`) and execution metadata are not persisted to this file—they exist only in memory during execution.

**Useful for:**

- Understanding what schema the Manager generated
- Reviewing the execution plan before it ran
- Debugging agent initialization issues
- Correlating session IDs with agent logs

### Verbose mode for live debugging

Use `-v` or `npm run start:verbose` to see real-time output from each agent as nodes execute:

```text
============================================================
[NODE START] write-code (Write Script)
  Agent: codex
  Attempt: 1/1
============================================================
[... agent output streams here ...]
------------------------------------------------------------
[NODE END] write-code - SUCCESS (4123ms)
------------------------------------------------------------
```

This is invaluable for understanding agent behavior and debugging prompt issues.

## Limitations

**Current limitations to be aware of:**

- **Non-deterministic planning** — The same prompt may produce different execution plans on different runs due to LLM variability
- **One-shot execution** — Plans cannot be interactively refined after generation; the full workflow executes automatically
- **No manual schema authoring** — The Manager generates all schemas; custom schema input is not supported
- **Agent availability** — All agents in your config must be installed and authenticated before execution
- **Parallel execution order** — When nodes run in parallel, completion order (and thus final output selection) is non-deterministic
- **No persistent sessions** — Agent sessions only persist within a single run; subsequent runs start fresh
- **Pre-execution state only** — The `state.json` file captures initial state; node outputs are not persisted to disk
- **No streaming output** — Graph execution uses `graph.invoke()` which waits for completion rather than streaming results

## API Reference

> **Note:** This reference is for understanding the generated schema structure. Manual schema authoring is not currently supported—the Manager generates all schemas automatically.

### State Machine Schema

The Manager generates a workflow matching this structure (validated by Zod):

```typescript
{
  plan: string,              // Execution plan description
  diagram: string,           // ASCII/text diagram of flow
  nodes: [{
    id: string,              // Unique node identifier
    name: string,            // Human-readable name
    description: string,     // What this node does
    agentType: "claude" | "codex" | "gemini",  // Constrained by config
    basePrompt: string,      // The prompt for execution
    maxRetries?: number,     // Graph-level retry attempts (default: 0, meaning 1 total attempt)
    onSuccess?: string,      // JS expression for metadata on success
    onError?: string         // JS expression for metadata on error
  }],
  edges: [{
    from: string,
    to: string,
    condition?: {
      code: string,          // JS expression returning boolean
      description?: string
    }
  }],
  startNodeId: string,
  endNodeId: string,
  initialMetadata?: Record<string, unknown>
}
```

**Note:** The `agentType` field is constrained at runtime to only allow agents listed in your config.

### Retry Behavior

There are two layers of retry logic:

1. **Graph-level retries** (`maxRetries` per node): Controlled by the schema. Default is 0, meaning 1 attempt. If a node fails, the graph can retry that node up to `maxRetries` additional times.

2. **Agent-level retries** (internal to `BaseCLIAgent`): Each agent automatically retries once on transient failures (e.g., network issues). This is hardcoded to 1 retry (2 total attempts) and happens transparently within a single graph-level attempt.

**Example:** With `maxRetries: 1` (2 graph attempts) and internal agent retry (2 attempts each), a node could attempt execution up to 4 times total before failing.

### How Nodes Receive Context

Each node receives its `basePrompt` plus a "Context from previous steps" section containing the `nodeOutputs` from all completed nodes as JSON. This allows downstream nodes to build upon prior results.

**Example injected context:**

```
Context from previous steps:
{
  "plan-impl": "I recommend using requests library with BeautifulSoup...",
  "write-code": "import requests\nfrom bs4 import BeautifulSoup..."
}
```

**Note:** The first node to execute receives `{}` as its context since no prior outputs exist.

### Conditional Routing

Edge conditions are JavaScript expressions evaluated at runtime after the source node completes. The expression must return a boolean and has access to a `ctx` object:

```javascript
// ctx provides:
{
  nodeOutputs: Record<string, string>,  // Outputs from completed nodes
  metadata: Record<string, unknown>,    // Accumulated metadata
  error: string | null,                 // Current error state
  currentNode: string | null            // Current node ID (null at start)
}
```

Example conditions:

```javascript
// Route based on output content
ctx.nodeOutputs['write-code'] !== ''

// Route based on error state (success path)
ctx.error === null

// Route on error (error-handling path)
ctx.error !== null

// Route based on metadata
ctx.metadata.testsPass === true
```

**Note:** The `code` field must be an expression, not a statement block (it's wrapped internally as `return (<code>)`).

### Metadata Hooks

The `onSuccess` and `onError` hooks allow nodes to update shared metadata. These are JavaScript expressions with access to:

| Variable | Description | Available In |
|----------|-------------|--------------|
| `$output` | The node's output string | `onSuccess` only |
| `$error` | Error message | `onError` only |
| `$elapsedMs` | Execution time in milliseconds | Both |
| `$retryCount` | Number of graph-level retry attempts used (0-indexed) | Both |
| `$metadata` | Current metadata object | Both |
| `$nodeId` | The node's ID | Both |

The hook must return an object to merge into metadata. Non-object returns are ignored.

```javascript
// Simple: track the last completed node
({ lastNode: $nodeId })

// Track timing
({ [`${$nodeId}Duration`]: $elapsedMs })

// Track retry count
({ [`${$nodeId}Retries`]: $retryCount })

// Advanced: append to an array (requires initialMetadata setup)
({ completedNodes: [...($metadata.completedNodes || []), $nodeId] })
```

**Tip:** Initialize arrays in `initialMetadata` before appending to them.

### Final Output

The final output is determined by `Object.values(result.nodeOutputs).pop()` — the last entry added to the `nodeOutputs` object by insertion order.

- In **sequential execution**, this is the last node to complete (typically `endNodeId`).
- In **parallel execution**, insertion order depends on completion timing, which may be non-deterministic.

If the final state contains an error after all retries are exhausted, the output is prefixed with `Error during execution:`.

**Tip:** For deterministic results, design your schema with a single final synthesis node that combines outputs from all prior nodes.

## Development

```bash
# Development mode with watch
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Build to dist/
npm run build

# Run compiled version (without tsx)
node dist/index.js "your prompt here"
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ISC
