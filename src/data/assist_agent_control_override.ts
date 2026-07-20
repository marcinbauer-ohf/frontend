/**
 * Client-side (localStorage) per-agent override of the "Control Home Assistant"
 * access, keyed by pipeline id.
 *
 * The underlying conversation agent grants control via its LLM API (the CONTROL
 * feature). This override lets a user turn control off for a specific Assist
 * agent (pipeline) without affecting the same conversation agent when used
 * elsewhere (e.g. in automations). When a pipeline has no entry here, the
 * agent's own capability is used.
 *
 * NOTE: enforcing this override at runtime (chat behaviour, tool availability)
 * requires backend support; today it stores the user's intent only.
 */
export const ASSIST_AGENT_CONTROL_OVERRIDE_STORAGE_KEY =
  "assist-agent-control-override";

export type AssistAgentControlOverride = Record<string, boolean>;
