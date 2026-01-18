import { z } from "zod";
import { getConfig } from "../config.js";

export const AgentTypeSchema = z.enum(["claude", "codex", "gemini"]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export function createAgentTypeSchema(): z.ZodEnum<[string, ...string[]]> {
  const agents = getConfig().agents;
  if (agents.length === 0) {
    return z.enum(["claude", "codex", "gemini"]);
  }
  return z.enum(agents as [string, ...string[]]);
}

export function createStateNodeDefinitionSchema() {
  const agentTypeSchema = createAgentTypeSchema();
  return z.object({
    id: z.string().describe("Unique identifier for the node"),
    name: z.string().describe("Human-readable name for the node"),
    description: z.string().describe("Description of what this node does"),
    agentType: agentTypeSchema.describe("The type of CLI agent to use"),
    basePrompt: z.string().describe("The base prompt for this node's agent"),
    maxRetries: z.number().optional().describe("Maximum retry attempts for this node (default: 1)"),
    onSuccess: z.string().optional().describe("JS code to update metadata on success. Access: $output, $elapsedMs, $metadata, $nodeId. Return: partial metadata object to merge."),
    onError: z.string().optional().describe("JS code to update metadata on error. Access: $error, $elapsedMs, $retryCount, $metadata, $nodeId. Return: partial metadata object to merge."),
  });
}

export const StateNodeDefinitionSchema = z.object({
  id: z.string().describe("Unique identifier for the node"),
  name: z.string().describe("Human-readable name for the node"),
  description: z.string().describe("Description of what this node does"),
  agentType: AgentTypeSchema.describe("The type of CLI agent to use"),
  basePrompt: z.string().describe("The base prompt for this node's agent"),
  maxRetries: z.number().optional().describe("Maximum retry attempts for this node (default: 1)"),
  onSuccess: z.string().optional().describe("JS code to update metadata on success. Access: $output, $elapsedMs, $metadata, $nodeId. Return: partial metadata object to merge."),
  onError: z.string().optional().describe("JS code to update metadata on error. Access: $error, $elapsedMs, $retryCount, $metadata, $nodeId. Return: partial metadata object to merge."),
});
export type StateNodeDefinition = z.infer<typeof StateNodeDefinitionSchema>;

export const ConditionDefinitionSchema = z.object({
  code: z.string().describe("JavaScript code that returns boolean. Has access to: ctx.nodeOutputs, ctx.metadata, ctx.error, ctx.currentNode"),
  description: z.string().optional().describe("Human-readable description of the condition"),
});
export type ConditionDefinition = z.infer<typeof ConditionDefinitionSchema>;

export const EdgeDefinitionSchema = z.object({
  from: z.string().describe("Source node ID"),
  to: z.string().describe("Target node ID"),
  condition: ConditionDefinitionSchema.optional().describe("Optional condition for this edge transition"),
});
export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

export function createStateMachineSchemaDefinition() {
  const stateNodeSchema = createStateNodeDefinitionSchema();
  return z.object({
    plan: z.string().describe("Brief explanation of the execution plan"),
    diagram: z.string().describe("State machine diagram showing the flow between nodes"),
    nodes: z.array(stateNodeSchema).describe("List of state nodes"),
    edges: z.array(EdgeDefinitionSchema).describe("List of edges connecting nodes"),
    startNodeId: z.string().describe("ID of the starting node"),
    endNodeId: z.string().describe("ID of the final node"),
    initialMetadata: z.record(z.unknown()).optional().describe("Initial metadata values defined by the planner"),
  });
}

export const StateMachineSchemaDefinition = z.object({
  plan: z.string().describe("Brief explanation of the execution plan"),
  diagram: z.string().describe("State machine diagram showing the flow between nodes"),
  nodes: z.array(StateNodeDefinitionSchema).describe("List of state nodes"),
  edges: z.array(EdgeDefinitionSchema).describe("List of edges connecting nodes"),
  startNodeId: z.string().describe("ID of the starting node"),
  endNodeId: z.string().describe("ID of the final node"),
  initialMetadata: z.record(z.unknown()).optional().describe("Initial metadata values defined by the planner"),
});
export type StateMachineSchema = z.infer<typeof StateMachineSchemaDefinition>;

export interface OrchestratorState {
  prompt: string;
  nodeOutputs: Record<string, string>;
  finalAnswer: string;
  error: string | null;
  metadata: Record<string, unknown>;
  currentNode: string | null;
}

export interface ConditionContext {
  nodeOutputs: Record<string, string>;
  metadata: Record<string, unknown>;
  error: string | null;
  currentNode: string | null;
}

export interface MetadataUpdateContext {
  $output?: string;
  $error?: string;
  $elapsedMs: number;
  $retryCount: number;
  $metadata: Record<string, unknown>;
  $nodeId: string;
}
