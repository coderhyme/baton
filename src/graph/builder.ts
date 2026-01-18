import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import type {
  StateNodeDefinition,
  StateMachineSchema,
  CLIAgent,
  ConditionContext,
  MetadataUpdateContext,
} from "../types/index.js";
import { getConfig } from "../config.js";

export const OrchestratorStateAnnotation = Annotation.Root({
  prompt: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),
  nodeOutputs: Annotation<Record<string, string>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  finalAnswer: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),
  error: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  metadata: Annotation<Record<string, unknown>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  currentNode: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  _retryCount: Annotation<Record<string, number>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
});

export type OrchestratorStateType = typeof OrchestratorStateAnnotation.State;

function executeMetadataUpdate(
  code: string,
  context: MetadataUpdateContext
): Record<string, unknown> {
  try {
    const fn = new Function(
      "$output", "$error", "$elapsedMs", "$retryCount", "$metadata", "$nodeId",
      `return (${code})`
    );
    const result = fn(
      context.$output,
      context.$error,
      context.$elapsedMs,
      context.$retryCount,
      context.$metadata,
      context.$nodeId
    );
    return typeof result === "object" && result !== null ? result : {};
  } catch (error) {
    console.error(`Failed to execute metadata update code: ${code}`, error);
    return {};
  }
}

function createNodeExecutor(
  node: StateNodeDefinition,
  agents: Map<string, CLIAgent>
) {
  return async (state: OrchestratorStateType): Promise<Partial<OrchestratorStateType>> => {
    const { verbose } = getConfig();
    const agent = agents.get(node.id);
    if (!agent) {
      return {
        error: `No agent available for node: ${node.id}`,
        currentNode: node.id,
      };
    }

    const startTime = Date.now();
    const attemptNumber = (state._retryCount[node.id] ?? 0) + 1;
    const maxRetries = node.maxRetries ?? 0;
    const totalAttempts = maxRetries + 1;

    if (verbose) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`[NODE START] ${node.id} (${node.name})`);
      console.log(`  Agent: ${node.agentType}`);
      console.log(`  Attempt: ${attemptNumber}/${totalAttempts}`);
      console.log(`${"=".repeat(60)}`);
    }

    try {
      const fullPrompt = `${node.basePrompt}\n\nContext from previous steps:\n${JSON.stringify(state.nodeOutputs, null, 2)}`;
      const output = await agent.execute(fullPrompt);
      const elapsedMs = Date.now() - startTime;

      if (verbose) {
        console.log(`\n${"-".repeat(60)}`);
        console.log(`[NODE END] ${node.id} - SUCCESS (${elapsedMs}ms)`);
        console.log(`${"-".repeat(60)}`);
        console.log(`Output:\n${output}`);
        console.log(`${"-".repeat(60)}\n`);
      }

      let metadataUpdate: Record<string, unknown> = {};
      if (node.onSuccess) {
        metadataUpdate = executeMetadataUpdate(node.onSuccess, {
          $output: output,
          $elapsedMs: elapsedMs,
          $retryCount: attemptNumber - 1,
          $metadata: state.metadata,
          $nodeId: node.id,
        });
      }

      return {
        nodeOutputs: { [node.id]: output },
        metadata: metadataUpdate,
        currentNode: node.id,
        error: null,
        _retryCount: { [node.id]: attemptNumber },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - startTime;

      if (verbose) {
        console.log(`\n${"-".repeat(60)}`);
        console.log(`[NODE END] ${node.id} - FAILED (${elapsedMs}ms)`);
        console.log(`${"-".repeat(60)}`);
        console.log(`Error: ${errorMessage}`);
        console.log(`${"-".repeat(60)}\n`);
      }

      let metadataUpdate: Record<string, unknown> = {};
      if (node.onError) {
        metadataUpdate = executeMetadataUpdate(node.onError, {
          $error: errorMessage,
          $elapsedMs: elapsedMs,
          $retryCount: attemptNumber - 1,
          $metadata: state.metadata,
          $nodeId: node.id,
        });
      }

      // Can retry if we haven't exhausted all attempts
      if (attemptNumber < totalAttempts) {
        return {
          metadata: metadataUpdate,
          currentNode: node.id,
          error: errorMessage,
          _retryCount: { [node.id]: attemptNumber },
        };
      }

      return {
        error: `Node ${node.id} failed after ${attemptNumber} attempts: ${errorMessage}`,
        metadata: metadataUpdate,
        currentNode: node.id,
        _retryCount: { [node.id]: attemptNumber },
      };
    }
  };
}

function evaluateCondition(
  conditionCode: string,
  ctx: ConditionContext
): boolean {
  try {
    const fn = new Function("ctx", `return (${conditionCode})`);
    return fn(ctx);
  } catch (error) {
    console.error(`Failed to evaluate condition: ${conditionCode}`, error);
    return false;
  }
}

function createConditionRouter(
  schema: StateMachineSchema,
  fromNodeId: string
) {
  const outgoingEdges = schema.edges.filter((e) => e.from === fromNodeId);
  const node = schema.nodes.find((n) => n.id === fromNodeId);
  const totalAttempts = (node?.maxRetries ?? 0) + 1;

  return (state: OrchestratorStateType): string | string[] => {
    const ctx: ConditionContext = {
      nodeOutputs: state.nodeOutputs,
      metadata: state.metadata,
      error: state.error,
      currentNode: state.currentNode,
    };

    const attemptNumber = state._retryCount[fromNodeId] ?? 0;
    const hasOutput = fromNodeId in state.nodeOutputs;

    // Retry logic: retry if we haven't exhausted all attempts
    if (state.error && !hasOutput && attemptNumber < totalAttempts) {
      return fromNodeId;
    }

    // Error with all attempts exhausted - find matching conditional edge
    if (state.error && attemptNumber >= totalAttempts) {
      for (const edge of outgoingEdges) {
        if (edge.condition && evaluateCondition(edge.condition.code, ctx)) {
          return edge.to;
        }
      }
      return END;
    }

    // Collect all destinations for parallel execution
    const destinations: string[] = [];

    // Unconditional edges (always execute in parallel)
    const unconditionalEdges = outgoingEdges.filter((e) => !e.condition);
    for (const edge of unconditionalEdges) {
      destinations.push(edge.to);
    }

    // Conditional edges (execute if condition is true)
    const conditionalEdges = outgoingEdges.filter((e) => e.condition);
    for (const edge of conditionalEdges) {
      if (evaluateCondition(edge.condition!.code, ctx)) {
        destinations.push(edge.to);
      }
    }

    // Return based on number of destinations
    if (destinations.length === 0) {
      return END;
    } else if (destinations.length === 1) {
      return destinations[0];
    } else {
      return destinations; // Fan-out to multiple nodes
    }
  };
}

export interface BuildGraphOptions {
  initialMetadata?: Record<string, unknown>;
}

export function buildGraph(
  schema: StateMachineSchema,
  agents: Map<string, CLIAgent>,
  options?: BuildGraphOptions
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(OrchestratorStateAnnotation) as any;

  for (const node of schema.nodes) {
    graph.addNode(node.id, createNodeExecutor(node, agents));
  }

  graph.addEdge(START, schema.startNodeId);

  const nodesWithOutgoingEdges = new Set(schema.edges.map((e) => e.from));

  for (const nodeId of nodesWithOutgoingEdges) {
    const outgoingEdges = schema.edges.filter((e) => e.from === nodeId);
    const hasConditions = outgoingEdges.some((e) => e.condition);
    const node = schema.nodes.find((n) => n.id === nodeId);
    const hasRetry = (node?.maxRetries ?? 0) > 0;

    if (hasConditions || outgoingEdges.length > 1 || hasRetry) {
      const possibleDestinations = outgoingEdges.map((e) => e.to);
      possibleDestinations.push(END);
      if (hasRetry) {
        possibleDestinations.push(nodeId);
      }

      graph.addConditionalEdges(
        nodeId,
        createConditionRouter(schema, nodeId),
        [...new Set(possibleDestinations)]
      );
    } else if (outgoingEdges.length === 1) {
      const target = outgoingEdges[0].to;
      graph.addEdge(nodeId, target);
    }
  }

  const endNodeHasOutgoing = schema.edges.some((e) => e.from === schema.endNodeId);
  if (!endNodeHasOutgoing) {
    const endNodeExists = schema.nodes.some((n) => n.id === schema.endNodeId);
    if (endNodeExists) {
      graph.addEdge(schema.endNodeId, END);
    }
  }

  return {
    compiled: graph.compile(),
    initialMetadata: { ...schema.initialMetadata, ...options?.initialMetadata },
  };
}
