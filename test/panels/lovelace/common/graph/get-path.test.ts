import { describe, expect, it } from "vitest";
import { getPath } from "../../../../../src/panels/lovelace/common/graph/get-path";

describe("getPath", () => {
  const points = [
    [0, 10],
    [5, 0],
    [10, 10],
  ];

  it("runs a straight path through every point", () => {
    expect(getPath(points, false)).toBe("M 0,10 L 5,0 L 10,10");
  });

  it("keeps the smoothed curve by default, which only bends toward a peak", () => {
    const path = getPath(points);
    expect(path.startsWith("M 0,10")).toBe(true);
    expect(path).toContain("Q5,0");
    expect(path).not.toContain("L");
  });

  it("draws nothing for no points", () => {
    expect(getPath([], false)).toBe("");
  });
});
