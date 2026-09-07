/** Matches Home Assistant beta (`2026.9.0b3`) and dev (`2026.9.0.dev0`) builds. */
const BETA_VERSION_REGEX = /\d+\.\d+\.\d+(b\d+|\.dev\d*)/;

export const isBetaVersion = (version: string): boolean =>
  BETA_VERSION_REGEX.test(version);

/** Dev override so the beta feedback feature can be exercised on a stable build. */
export const BETA_FEEDBACK_FORCE_KEY = "beta_feedback_force";

/**
 * Whether the beta feedback feature is active. Everything belonging to that
 * feature (sidebar item, quick bar command, shortcut, error buffer, dialog
 * import) must be gated on this so stable builds carry no footprint.
 */
export const isBetaFeedbackEnabled = (version: string | undefined): boolean => {
  // always on when running `yarn dev` against a stable core
  if (__DEV__) {
    return true;
  }
  try {
    if (localStorage.getItem(BETA_FEEDBACK_FORCE_KEY) === "1") {
      return true;
    }
  } catch (_err) {
    // localStorage can throw in private mode / restricted webviews
  }
  return !!version && isBetaVersion(version);
};
