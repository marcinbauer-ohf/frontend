import type { TemplateResult } from "lit";
import { render } from "lit";
import { parseAnimationDuration } from "../common/util/parse-animation-duration";

let removalInitiated = false;

/**
 * Minimum time the launch screen stays up. A boot screen that flashes for 200ms
 * on a fast connect reads as a glitch, so it is floored. Measured against the
 * navigation start, which is when the screen was painted.
 */
const MIN_DISPLAY_MS = 1500;

/**
 * Removes the launch screen with a CSS fade-out transition.
 *
 * @param instant - Removes the launch screen without animation. Used when the
 * external app covers the frontend with its own splash screen until the
 * `frontend/loaded` event, where the animation would play invisibly underneath.
 * @returns Whether this call initiated the removal (false when the removal
 * was already initiated, e.g. while the fade-out is still running).
 */
export const removeLaunchScreen = (instant = false): boolean => {
  const launchScreenElement = document.getElementById("ha-launch-screen");
  if (removalInitiated || !launchScreenElement?.parentElement) {
    return false;
  }
  removalInitiated = true;

  const remove = () => {
    // Anything that must not animate while the boot screen is still up gates on
    // this, so it is set as the hand-off starts, not when it finishes.
    document.documentElement.classList.add("booted");

    if (instant) {
      launchScreenElement.parentElement?.removeChild(launchScreenElement);
      return;
    }

    launchScreenElement.classList.add("removing");
    const durationFromCss = getComputedStyle(document.documentElement)
      .getPropertyValue("--ha-animation-duration-normal")
      .trim();
    setTimeout(
      () => {
        launchScreenElement.parentElement?.removeChild(launchScreenElement);
      },
      parseAnimationDuration(durationFromCss || "250ms")
    );
  };

  // The removal is still ours (callers rely on the return value to fire
  // `frontend/loaded` exactly once); it just waits out the minimum display time.
  const remainingMinDisplay = MIN_DISPLAY_MS - performance.now();
  if (!instant && remainingMinDisplay > 0) {
    setTimeout(remove, remainingMinDisplay);
  } else {
    remove();
  }
  return true;
};

export const renderLaunchScreenContent = (
  content: TemplateResult,
  attribution: string
) => {
  const infoBoxElement = document.getElementById("ha-launch-screen-info-box");
  if (infoBoxElement) {
    render(content, infoBoxElement);
  }
  updateLaunchScreenAttribution(attribution);
};

/**
 * Switches the launch screen OHF logo to the variant matching the applied
 * theme. The `<picture>` element initially picks a variant based on the system
 * color scheme, which can differ from the theme the frontend ends up applying.
 */
export const updateLaunchScreenLogo = (darkMode: boolean) => {
  const logoSourceElement = document.querySelector<HTMLSourceElement>(
    "#ha-launch-screen .ohf-logo source"
  );
  if (logoSourceElement) {
    logoSourceElement.media = darkMode ? "all" : "not all";
  }
};

export const updateLaunchScreenAttribution = (attribution: string) => {
  const attributionElement = document.getElementById(
    "ha-launch-screen-attribution"
  );
  if (attributionElement) {
    attributionElement.textContent = attribution;
  }
};
