import { createContext } from "@lit/context";

export const maxColumnsContext = createContext<number>("lovelace-max-columns");

/** The path of the card open in the dashboard's card editor, joined. */
export const selectedCardContext = createContext<string | undefined>(
  "lovelace-selected-card"
);
