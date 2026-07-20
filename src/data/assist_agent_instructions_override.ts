/**
 * Client-side (localStorage) per-agent override of the conversation agent's
 * instructions (prompt), keyed by pipeline id.
 *
 * The underlying conversation agent defines its instructions in its own
 * integration options. This override lets a user set different instructions
 * for a specific Assist agent (pipeline) without affecting the same
 * conversation agent when used elsewhere. When a pipeline has no entry here,
 * the agent's own instructions are used.
 *
 * NOTE: enforcing this override at runtime (chat behaviour) requires backend
 * support; today it stores the user's intent only.
 */
export const ASSIST_AGENT_INSTRUCTIONS_OVERRIDE_STORAGE_KEY =
  "assist-agent-instructions-override";

export type AssistAgentInstructionsOverride = Record<string, string>;
