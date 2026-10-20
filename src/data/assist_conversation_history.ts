/**
 * Client-side (localStorage) persistence for Assist chat history.
 *
 * Conversations are stored locally only — there is no backend for saved Assist
 * conversations. Message text is stored as plain strings; rich (TemplateResult)
 * content rendered live in the chat is not persisted.
 */

export const ASSIST_CONVERSATION_HISTORY_STORAGE_KEY = "assist-conversations";

/** Maximum number of conversations to keep in local history. */
export const MAX_STORED_CONVERSATIONS = 50;

export interface StoredAssistMessage {
  who: "user" | "hass";
  text: string;
  error?: boolean;
}

export interface StoredAssistConversation {
  id: string;
  title: string;
  created: number;
  updated: number;
  pipeline_id?: string;
  conversation_id?: string | null;
  messages: StoredAssistMessage[];
}

const MAX_TITLE_LENGTH = 60;

export const createConversationId = (): string =>
  "id" in crypto && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/** Derive a short title from the first user message. */
export const deriveConversationTitle = (
  messages: StoredAssistMessage[]
): string => {
  const firstUserMessage = messages.find(
    (message) => message.who === "user" && message.text.trim()
  );
  const source = firstUserMessage?.text.trim() ?? "";
  if (!source) {
    return "";
  }
  const singleLine = source.replace(/\s+/g, " ");
  return singleLine.length > MAX_TITLE_LENGTH
    ? `${singleLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : singleLine;
};

/** Whether a conversation has any user-authored content worth storing. */
export const conversationHasUserContent = (
  messages: StoredAssistMessage[]
): boolean =>
  messages.some((message) => message.who === "user" && !!message.text.trim());

/**
 * Insert or update a conversation in the list, keeping it sorted by most
 * recently updated and capped at MAX_STORED_CONVERSATIONS.
 */
export const upsertConversation = (
  conversations: StoredAssistConversation[],
  conversation: StoredAssistConversation
): StoredAssistConversation[] => {
  const next = conversations.filter((item) => item.id !== conversation.id);
  next.unshift(conversation);
  next.sort((a, b) => b.updated - a.updated);
  return next.slice(0, MAX_STORED_CONVERSATIONS);
};

export const removeConversation = (
  conversations: StoredAssistConversation[],
  id: string
): StoredAssistConversation[] => conversations.filter((item) => item.id !== id);

/** Case-insensitive search across a conversation title and message text. */
export const conversationMatchesSearch = (
  conversation: StoredAssistConversation,
  search: string
): boolean => {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (conversation.title.toLowerCase().includes(needle)) {
    return true;
  }
  return conversation.messages.some((message) =>
    message.text.toLowerCase().includes(needle)
  );
};
