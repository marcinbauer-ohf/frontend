import { createQueryString, type QueryParamConfig } from "./query-params";

/** `edit` opens the home page's editor on one of its views. */
export const homeQueryParamConfig = {
  string: ["edit"],
} as const satisfies QueryParamConfig;

export const homeEditorPath = (view: string): string =>
  `/home?${createQueryString({ edit: view }, homeQueryParamConfig)}`;
