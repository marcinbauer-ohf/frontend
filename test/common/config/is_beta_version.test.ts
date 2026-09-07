import { afterEach, describe, expect, it } from "vitest";
import {
  BETA_FEEDBACK_FORCE_KEY,
  isBetaFeedbackEnabled,
  isBetaVersion,
} from "../../../src/common/config/is_beta_version";

describe("isBetaVersion", () => {
  it("matches beta builds", () => {
    expect(isBetaVersion("2026.9.0b0")).toBe(true);
    expect(isBetaVersion("2026.9.0b3")).toBe(true);
    expect(isBetaVersion("2026.12.1b12")).toBe(true);
  });

  it("matches dev builds", () => {
    expect(isBetaVersion("2026.9.0.dev0")).toBe(true);
    expect(isBetaVersion("2026.9.0.dev")).toBe(true);
    expect(isBetaVersion("2026.9.0.dev20260901")).toBe(true);
  });

  it("does not match stable builds", () => {
    expect(isBetaVersion("2026.9.0")).toBe(false);
    expect(isBetaVersion("2026.9.1")).toBe(false);
    expect(isBetaVersion("2026.12.10")).toBe(false);
  });
});

describe("isBetaFeedbackEnabled", () => {
  afterEach(() => {
    localStorage.clear();
    global.__DEV__ = false;
  });

  it("is always on in a dev build", () => {
    global.__DEV__ = true;
    expect(isBetaFeedbackEnabled("2026.9.0")).toBe(true);
    expect(isBetaFeedbackEnabled(undefined)).toBe(true);
  });

  it("follows the version by default", () => {
    expect(isBetaFeedbackEnabled("2026.9.0b3")).toBe(true);
    expect(isBetaFeedbackEnabled("2026.9.0")).toBe(false);
  });

  it("is off without a version", () => {
    expect(isBetaFeedbackEnabled(undefined)).toBe(false);
    expect(isBetaFeedbackEnabled("")).toBe(false);
  });

  it("can be forced on for a stable build", () => {
    localStorage.setItem(BETA_FEEDBACK_FORCE_KEY, "1");
    expect(isBetaFeedbackEnabled("2026.9.0")).toBe(true);
  });

  it("ignores any other value of the override", () => {
    localStorage.setItem(BETA_FEEDBACK_FORCE_KEY, "0");
    expect(isBetaFeedbackEnabled("2026.9.0")).toBe(false);
  });
});
