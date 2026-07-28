import type { Connection } from "home-assistant-js-websocket";
import type { ShortcutItem } from "./home_shortcuts";

export interface CoreFrontendUserData {
  showEntityIdPicker?: boolean;
  default_panel?: string;
  apps_info_dismissed?: boolean;
}

export interface SidebarCustomItem {
  title: string;
  icon?: string;
  /** SVG path data, used for items added from settings pages */
  iconPath?: string;
  path: string;
}

export interface SidebarFrontendUserData {
  panelOrder?: string[];
  hiddenPanels?: string[];
  customItems?: SidebarCustomItem[];
}

const moveItem = <T>(items: T[], from: number, to: number): T[] => {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

/**
 * Apply a sortable move over an edit-mode navigation list, which renders the
 * panels first and the custom links after them. The saved order keeps those two
 * as separate lists, so a row can only move within its own group; a move that
 * crosses the boundary returns `null` and is left to roll back.
 */
export const applySidebarMove = (
  move: { oldIndex: number; newIndex: number },
  panelPaths: string[],
  customItems: SidebarCustomItem[]
): { panelOrder: string[]; customItems: SidebarCustomItem[] } | null => {
  const { oldIndex, newIndex } = move;
  const panelCount = panelPaths.length;

  if (oldIndex < panelCount !== newIndex < panelCount) {
    return null;
  }

  return oldIndex < panelCount
    ? { panelOrder: moveItem(panelPaths, oldIndex, newIndex), customItems }
    : {
        panelOrder: panelPaths,
        customItems: moveItem(
          customItems,
          oldIndex - panelCount,
          newIndex - panelCount
        ),
      };
};

export interface CoreFrontendSystemData {
  default_panel?: string;
  onboarded_version?: string;
  onboarded_date?: string;
}

export interface HomeFrontendSystemData {
  favorite_entities?: string[];
  welcome_banner_dismissed?: boolean;
  hide_welcome_message?: boolean;
  hide_suggested_entities?: boolean;
  shortcuts?: ShortcutItem[];
}

export interface EnergyFrontendSystemData {
  // Stable "<view>.<card-type>" keys of energy dashboard cards the user has
  // hidden. An absent key or array means nothing is hidden (all cards visible),
  // so cards added in the future are shown by default.
  hidden_cards?: string[];
}

declare global {
  interface FrontendUserData {
    core: CoreFrontendUserData;
    sidebar: SidebarFrontendUserData;
  }
  interface FrontendSystemData {
    core: CoreFrontendSystemData;
    home: HomeFrontendSystemData;
    energy: EnergyFrontendSystemData;
  }
}

export type ValidUserDataKey = keyof FrontendUserData;

export type ValidSystemDataKey = keyof FrontendSystemData;

export const fetchFrontendUserData = async <
  UserDataKey extends ValidUserDataKey,
>(
  conn: Connection,
  key: UserDataKey
): Promise<FrontendUserData[UserDataKey] | null> => {
  const result = await conn.sendMessagePromise<{
    value: FrontendUserData[UserDataKey] | null;
  }>({
    type: "frontend/get_user_data",
    key,
  });
  return result.value;
};

export const saveFrontendUserData = async <
  UserDataKey extends ValidUserDataKey,
>(
  conn: Connection,
  key: UserDataKey,
  value: FrontendUserData[UserDataKey]
): Promise<void> =>
  conn.sendMessagePromise<undefined>({
    type: "frontend/set_user_data",
    key,
    value,
  });

export const subscribeFrontendUserData = <UserDataKey extends ValidUserDataKey>(
  conn: Connection,
  userDataKey: UserDataKey,
  onChange: (data: { value: FrontendUserData[UserDataKey] | null }) => void
) =>
  conn.subscribeMessage<{ value: FrontendUserData[UserDataKey] | null }>(
    onChange,
    {
      type: "frontend/subscribe_user_data",
      key: userDataKey,
    }
  );

export const fetchFrontendSystemData = async <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  key: SystemDataKey
): Promise<FrontendSystemData[SystemDataKey] | null> => {
  const result = await conn.sendMessagePromise<{
    value: FrontendSystemData[SystemDataKey] | null;
  }>({
    type: "frontend/get_system_data",
    key,
  });
  return result.value;
};

export const saveFrontendSystemData = async <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  key: SystemDataKey,
  value: FrontendSystemData[SystemDataKey]
): Promise<void> =>
  conn.sendMessagePromise<undefined>({
    type: "frontend/set_system_data",
    key,
    value,
  });

export const subscribeFrontendSystemData = <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  systemDataKey: SystemDataKey,
  onChange: (data: { value: FrontendSystemData[SystemDataKey] | null }) => void
) =>
  conn.subscribeMessage<{ value: FrontendSystemData[SystemDataKey] | null }>(
    onChange,
    {
      type: "frontend/subscribe_system_data",
      key: systemDataKey,
    }
  );
