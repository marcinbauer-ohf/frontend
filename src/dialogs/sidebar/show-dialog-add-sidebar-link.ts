import { fireEvent } from "../../common/dom/fire_event";
import type { SidebarCustomItem } from "../../data/frontend";

export const loadAddSidebarLinkDialog = () =>
  import("./dialog-add-sidebar-link");

export const showAddSidebarLinkDialog = (
  element: HTMLElement
): Promise<SidebarCustomItem | null> =>
  new Promise((resolve) => {
    fireEvent(element, "show-dialog", {
      dialogTag: "dialog-add-sidebar-link",
      dialogImport: loadAddSidebarLinkDialog,
      dialogParams: {
        add: (item: SidebarCustomItem) => resolve(item),
        cancel: () => resolve(null),
      },
    });
  });
