import type { OrchestratorStateType } from "./builder.js";

export interface ExecutionResult {
  finalAnswer: string;
  nodeOutputs: Record<string, string>;
  metadata: Record<string, unknown>;
  error: string | null;
}

export async function executeGraph(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graph: any,
  initialState: { prompt: string; metadata?: Record<string, unknown> }
): Promise<ExecutionResult> {
  const state: OrchestratorStateType = {
    prompt: initialState.prompt,
    nodeOutputs: {},
    finalAnswer: "",
    error: null,
    metadata: initialState.metadata ?? {},
    currentNode: null,
    _retryCount: {},
  };

  try {
    const result = await graph.invoke(state);

    const finalAnswer = result.error
      ? `Error during execution: ${result.error}`
      : Object.values(result.nodeOutputs).pop() || "No output generated";

    return {
      finalAnswer: finalAnswer as string,
      nodeOutputs: result.nodeOutputs,
      metadata: result.metadata,
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      finalAnswer: `Execution failed: ${errorMessage}`,
      nodeOutputs: {},
      metadata: initialState.metadata ?? {},
      error: errorMessage,
    };
  }
}
