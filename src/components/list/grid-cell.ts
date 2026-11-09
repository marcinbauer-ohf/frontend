// Moving the active cell of a grid made of list rows. The list moves between
// rows, so these only work out the column and whether to change rows.

/** A column past any row's end, clamped to the row's last cell. */
export const LAST_CELL = Number.MAX_SAFE_INTEGER;

export const clampGridCell = (col: number, rowLength: number): number =>
  Math.max(0, Math.min(col, rowLength - 1));

/**
 * The next cell in reading order, `forward` or back. Past the row's end it
 * moves to the next row's first cell, before its start to the previous row's
 * last cell.
 */
export const stepGridCell = (
  col: number,
  rowLength: number,
  forward: boolean
): { col: number; rowStep: -1 | 0 | 1 } => {
  const current = clampGridCell(col, rowLength);
  if (forward) {
    return current < rowLength - 1
      ? { col: current + 1, rowStep: 0 }
      : { col: 0, rowStep: 1 };
  }
  return current > 0
    ? { col: current - 1, rowStep: 0 }
    : { col: LAST_CELL, rowStep: -1 };
};

/** Whether an arrow key moves forward in reading order. */
export const isForwardKey = (key: string, rtl: boolean): boolean =>
  (key === "ArrowRight") !== rtl;
