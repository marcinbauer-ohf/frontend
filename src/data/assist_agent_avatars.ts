/**
 * Client-side (localStorage) mapping of Assist agent (pipeline) id → avatar.
 *
 * There is no backend field for an agent avatar, so the association between a
 * pipeline and its uploaded image is stored locally. The image bytes are
 * uploaded to the backend image integration by `ha-picture-upload`; only the
 * resulting media URL is kept here.
 */
export const ASSIST_AGENT_AVATARS_STORAGE_KEY = "assist-agent-avatars";

export type AssistAgentAvatars = Record<string, string>;
