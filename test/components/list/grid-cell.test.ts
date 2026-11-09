import { describe, expect, it } from "vitest";
import {
  clampGridCell,
  isForwardKey,
  LAST_CELL,
  stepGridCell,
} from "../../../src/components/list/grid-cell";

// Protects the keyboard moves of grid pickers: wrapping between rows, short
// last rows and right-to-left layouts are easy to break without noticing.
describe("grid cell moves", () => {
  it("moves within a row", () => {
    expect(stepGridCell(2, 8, true)).toEqual({ col: 3, rowStep: 0 });
    expect(stepGridCell(2, 8, false)).toEqual({ col: 1, rowStep: 0 });
  });

  it("wraps to the next row's first cell", () => {
    expect(stepGridCell(7, 8, true)).toEqual({ col: 0, rowStep: 1 });
  });

  it("wraps to the previous row's last cell", () => {
    const step = stepGridCell(0, 8, false);
    expect(step.rowStep).toBe(-1);
    expect(clampGridCell(step.col, 5)).toBe(4);
  });

  it("clamps a column to a short row", () => {
    expect(clampGridCell(6, 3)).toBe(2);
    expect(clampGridCell(LAST_CELL, 8)).toBe(7);
    // A column kept from a longer row steps from the short row's last cell
    expect(stepGridCell(6, 3, true)).toEqual({ col: 0, rowStep: 1 });
  });

  it("swaps left and right in right-to-left layouts", () => {
    expect(isForwardKey("ArrowRight", false)).toBe(true);
    expect(isForwardKey("ArrowLeft", false)).toBe(false);
    expect(isForwardKey("ArrowRight", true)).toBe(false);
    expect(isForwardKey("ArrowLeft", true)).toBe(true);
  });
});
