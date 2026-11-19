// Remembers what the user last clicked, so confirmations and small forms can
// open as a popover next to it without every caller passing an anchor.

const MENU_HOSTS = new Set(["ha-dropdown", "ha-md-button-menu"]);

const CLICKABLE =
  "ha-button, ha-icon-button, ha-list-item, ha-md-list-item, ha-dropdown-item, button, a, [role='button'], [role='menuitem']";

// Popovers and dialogs from these never anchor to their own buttons: they
// close as the next one opens, taking the anchor with them
const OWN_DIALOGS = new Set(["dialog-box", "dialog-form"]);

// ponytail: a fixed window, so a confirmation that waits on a slow request
// opens as a dialog. Pass `anchor` explicitly where that matters.
const MAX_AGE_MS = 1000;

let lastClick: { anchor?: Element; time: number } | undefined;

const findAnchor = (path: EventTarget[]): Element | undefined => {
  const elements = path.filter((t): t is Element => t instanceof Element);
  if (elements.some((el) => OWN_DIALOGS.has(el.localName))) {
    return undefined;
  }
  // A menu has closed by the time the dialog opens, so use its button
  const menu = elements.find((el) => MENU_HOSTS.has(el.localName));
  if (menu) {
    return menu.querySelector(":scope > [slot='trigger']") ?? menu;
  }
  return elements.find((el) => el.matches(CLICKABLE));
};

// No document when imported outside a browser, such as in Node tests
globalThis.document?.addEventListener(
  "click",
  (ev) => {
    lastClick = { anchor: findAnchor(ev.composedPath()), time: Date.now() };
  },
  { capture: true }
);

/**
 * The element the user just clicked, if it is still on screen. `null` in
 * `explicit` opts out, so the dialog opens centred.
 */
export const clickAnchor = (explicit?: Element | null): Element | undefined => {
  if (explicit !== undefined) {
    return explicit ?? undefined;
  }
  const anchor = lastClick?.anchor;
  if (
    !anchor ||
    Date.now() - lastClick!.time > MAX_AGE_MS ||
    !anchor.isConnected ||
    !anchor.getBoundingClientRect().width
  ) {
    return undefined;
  }
  return anchor;
};
