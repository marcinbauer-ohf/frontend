import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetaFeedbackReport } from "../../src/data/beta_feedback";
import {
  addToOutbox,
  flushOutbox,
  generateReportId,
  getOutbox,
  isRateLimited,
  RATE_LIMIT_MAX,
  removeFromOutbox,
  setBetaFeedbackTransport,
  submitBetaFeedback,
} from "../../src/data/beta_feedback";
import type { HomeAssistant } from "../../src/types";

const hass = {
  config: { beta_feedback_url: "https://example.test/feedback" },
} as unknown as HomeAssistant;

const makeReport = (id: string): BetaFeedbackReport => ({
  report_id: id,
  created_at: "2026-09-03T00:00:00.000Z",
  type: "bug",
  product_area: "Dashboards",
  message: "it broke",
  context: {},
  schema_version: 1,
});

describe("report ids", () => {
  it("are prefixed and 8 base32 characters long", () => {
    expect(generateReportId()).toMatch(/^bf_[A-Z2-7]{8}$/);
  });

  it("are not all the same", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateReportId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("outbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    setBetaFeedbackTransport({ send: async () => undefined });
    localStorage.clear();
  });

  it("keeps a failed report and rethrows", async () => {
    setBetaFeedbackTransport({
      send: async () => {
        throw new Error("offline");
      },
    });

    const report = makeReport("bf_AAAAAAAA");
    await expect(submitBetaFeedback(hass, report)).rejects.toThrow("offline");
    expect(getOutbox()).toHaveLength(1);
    expect(getOutbox()[0].report_id).toBe("bf_AAAAAAAA");
  });

  it("does not queue the same report twice", async () => {
    setBetaFeedbackTransport({
      send: async () => {
        throw new Error("offline");
      },
    });

    const report = makeReport("bf_AAAAAAAA");
    await expect(submitBetaFeedback(hass, report)).rejects.toThrow();
    await expect(submitBetaFeedback(hass, report)).rejects.toThrow();
    expect(getOutbox()).toHaveLength(1);
  });

  it("empties the outbox on a successful retry", async () => {
    addToOutbox(makeReport("bf_AAAAAAAA"));
    addToOutbox(makeReport("bf_BBBBBBBB"));

    const send = vi.fn().mockResolvedValue(undefined);
    setBetaFeedbackTransport({ send });

    await expect(flushOutbox(hass)).resolves.toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(getOutbox()).toHaveLength(0);
  });

  it("stops retrying at the first failure and keeps the rest", async () => {
    addToOutbox(makeReport("bf_AAAAAAAA"));
    addToOutbox(makeReport("bf_BBBBBBBB"));

    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("offline"));
    setBetaFeedbackTransport({ send });

    await expect(flushOutbox(hass)).resolves.toBe(1);
    expect(getOutbox().map((r) => r.report_id)).toEqual(["bf_BBBBBBBB"]);
  });

  it("removes a single report", () => {
    addToOutbox(makeReport("bf_AAAAAAAA"));
    addToOutbox(makeReport("bf_BBBBBBBB"));
    removeFromOutbox("bf_AAAAAAAA");
    expect(getOutbox().map((r) => r.report_id)).toEqual(["bf_BBBBBBBB"]);
  });

  it("survives unparseable storage", () => {
    localStorage.setItem("beta_feedback_outbox", "not json");
    expect(getOutbox()).toEqual([]);
  });
});

describe("rate limit", () => {
  beforeEach(() => {
    localStorage.clear();
    setBetaFeedbackTransport({ send: async () => undefined });
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("allows up to the limit and then blocks", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(isRateLimited()).toBe(false);
      // eslint-disable-next-line no-await-in-loop
      await submitBetaFeedback(hass, makeReport(`bf_AAAAAAA${i}`));
    }
    expect(isRateLimited()).toBe(true);
  });

  it("counts failed attempts too", async () => {
    setBetaFeedbackTransport({
      send: async () => {
        throw new Error("offline");
      },
    });
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        submitBetaFeedback(hass, makeReport(`bf_AAAAAAA${i}`))
      ).rejects.toThrow();
    }
    expect(isRateLimited()).toBe(true);
  });

  it("forgets attempts older than an hour", async () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      // eslint-disable-next-line no-await-in-loop
      await submitBetaFeedback(hass, makeReport(`bf_AAAAAAA${i}`));
    }
    expect(isRateLimited()).toBe(true);
    expect(isRateLimited(Date.now() + 3600_001)).toBe(false);
  });
});
