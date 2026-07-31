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

/**
 * Same shape, same caveat, for the "Build in Home Assistant" access: letting an
 * agent create and edit automations, dashboards, and settings instead of only
 * operating what already exists.
 *
 * ponytail: there is no backend grant for this yet, so this stores intent only
 * and nothing acts on it. Replace with the real per-agent grant once the
 * building tools exist.
 */
export const ASSIST_AGENT_BUILD_OVERRIDE_STORAGE_KEY =
  "assist-agent-build-override";
