/**
 * Shared storage key for the inline row-parameter experiment.
 *
 * The editor's menu writes it and every trigger/condition row subscribes to it,
 * so the toggle reaches the whole tree without being threaded through as a
 * property. Lives in its own module so rows do not have to import the editor.
 */
export const INLINE_PARAMETERS_STORAGE_KEY = "automation-inline-parameters";

/**
 * Shared storage key for the row-header order: targets and behavior first (the
 * default) or the set values first. Same mechanism as the key above.
 */
export const VALUES_FIRST_STORAGE_KEY = "automation-values-first";
