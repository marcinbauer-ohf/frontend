import { describe, expect, it } from "vitest";
import {
  guessProductArea,
  isKnownProductArea,
  redact,
} from "../../src/data/beta_feedback_context";

describe("redact", () => {
  it("redacts credentials given as key/value pairs", () => {
    expect(redact('token: "abc123def"')).toContain("<redacted>");
    expect(redact("api_key=s3cr3tvalue")).toBe("api_key=<redacted>");
    expect(redact("password: hunter2")).toBe("password: <redacted>");
    expect(redact("Authorization: Bearer xyz")).toContain("<redacted>");
  });

  it("redacts email addresses", () => {
    expect(redact("contact user.name+tag@example.com now")).toBe(
      "contact <redacted-email> now"
    );
  });

  it("redacts IPv4 and IPv6 addresses", () => {
    expect(redact("connecting to 192.168.1.42:8123")).toBe(
      "connecting to <redacted-ip>:8123"
    );
    expect(redact("host fe80:0:0:0:1")).toBe("host <redacted-ip>");
    expect(redact("host 2001:db8::1")).toBe("host <redacted-ip>");
  });

  it("does not mistake log timestamps for IPv6 addresses", () => {
    const line = "2026-09-03 12:34:56.789 ERROR (MainThread) started";
    expect(redact(line)).toBe(line);
  });

  it("redacts long opaque tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk";
    expect(redact(jwt)).toBe("<redacted-token>");
    expect(redact("hash 0123456789abcdef0123456789abcdef")).toBe(
      "hash <redacted-token>"
    );
  });

  it("leaves ordinary log lines alone", () => {
    const line = "[ERROR] homeassistant.components.zha: Device did not respond";
    expect(redact(line)).toBe(line);
  });
});

describe("guessProductArea", () => {
  it("maps paths to product areas", () => {
    expect(
      guessProductArea("/config/voice-assistants/assistants", "config")
    ).toBe("Voice");
    expect(guessProductArea("/config/energy", "config")).toBe("Energy");
    expect(guessProductArea("/energy/dashboard", "energy")).toBe("Energy");
    expect(guessProductArea("/config/lovelace/dashboards", "config")).toBe(
      "Dashboards"
    );
    expect(guessProductArea("/config/automation/edit/1", "config")).toBe(
      "Automations"
    );
    expect(guessProductArea("/config/script/edit/1", "config")).toBe(
      "Automations"
    );
    expect(
      guessProductArea("/config/integrations/integration/zha", "config")
    ).toBe("Devices & services");
    expect(guessProductArea("/config/devices/device/abc", "config")).toBe(
      "Devices & services"
    );
  });

  it("falls back to the panel", () => {
    expect(guessProductArea("/lovelace/0", "lovelace")).toBe("Dashboards");
  });

  it("prefers an open dialog over the path", () => {
    expect(
      guessProductArea("/lovelace/0", "lovelace", ["ha-voice-command-dialog"])
    ).toBe("Voice");
  });

  it("returns undefined when nothing matches, so the user picks", () => {
    expect(guessProductArea("/history", "history")).toBe(undefined);
    expect(guessProductArea("/config/backup", "config")).toBe(undefined);
  });

  it("only ever guesses a real product area", () => {
    const paths = [
      "/config/energy",
      "/config/voice-assistants",
      "/config/lovelace",
      "/config/automation",
      "/config/integrations",
      "/lovelace/0",
      "/energy",
    ];
    for (const path of paths) {
      const guess = guessProductArea(path, path.split("/")[1]);
      expect(isKnownProductArea(guess)).toBe(true);
    }
  });
});
