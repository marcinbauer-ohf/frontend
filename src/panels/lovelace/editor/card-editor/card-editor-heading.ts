import type { LocalizeFunc } from "../../../../common/translations/localize";
import {
  getCustomCardEntry,
  isCustomType,
  stripCustomPrefix,
} from "../../../../data/lovelace_custom_cards";

/** "Edit <type> card", the heading of a card's editor. */
export const cardEditorHeading = (
  localize: LocalizeFunc,
  type?: string
): string => {
  if (!type) {
    return localize("ui.panel.lovelace.editor.edit_card.header");
  }
  let cardName: string | undefined;
  if (isCustomType(type)) {
    cardName = getCustomCardEntry(stripCustomPrefix(type))?.name;
    // Trim names that end in " Card" so as not to redundantly duplicate it
    if (cardName?.toLowerCase().endsWith(" card")) {
      cardName = cardName.substring(0, cardName.length - 5);
    }
  } else {
    cardName = localize(`ui.panel.lovelace.editor.card.${type}.name`);
  }
  return localize("ui.panel.lovelace.editor.edit_card.typed_header", {
    type: cardName,
  });
};
