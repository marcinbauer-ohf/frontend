// ponytail: browser-only stand-ins for the assistant's memory and skills.
// Core has neither yet; replace with its API once it does. The seed entries
// are sample data so the pages have something to show.

export interface AssistantMemory {
  id: string;
  text: string;
  created: number;
}

export interface AssistantSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

const DAY = 24 * 60 * 60 * 1000;

export const SAMPLE_MEMORIES: AssistantMemory[] = [
  {
    id: "m1",
    text: "The porch light should stay on until everyone is home.",
    created: Date.now() - 2 * DAY,
  },
  {
    id: "m2",
    text: '"The reading light" means the floor lamp in the living room.',
    created: Date.now() - 9 * DAY,
  },
  {
    id: "m3",
    text: "Nobody is home on weekdays between 8:30 and 17:00.",
    created: Date.now() - 21 * DAY,
  },
];

export const SAMPLE_SKILLS: AssistantSkill[] = [
  {
    id: "s1",
    name: "Morning briefing",
    description:
      "Use when someone asks how their day looks or says good morning.",
    instructions:
      "Give the weather for today, the first calendar event, and anything left open or unlocked overnight. Keep it under four sentences.",
  },
];

// Written by the Assistant card's switch through @storage (JSON, so "false").
export const ASSISTANT_ENABLED_KEY = "assistant-enabled";

export const isAssistantEnabled = (): boolean => {
  try {
    return window.localStorage.getItem(ASSISTANT_ENABLED_KEY) !== "false";
  } catch (_err: unknown) {
    return true;
  }
};

// How much of the assistant a person may use. Admins always have "full".
export type AssistantAccess = "off" | "built_in" | "full";

export const ASSISTANT_ACCESS_KEY = "assistant-access";
