const midPoint = (
  _Ax: number,
  _Ay: number,
  _Bx: number,
  _By: number
): number[] => {
  const zX = (_Ax - _Bx) / 2 + _Bx;
  const zY = (_Ay - _By) / 2 + _By;
  return [zX, zY];
};

/**
 * An SVG path through the points. Smoothed, each point is the control point of
 * a curve that only runs near it; straight, the path passes through every point,
 * which is what a chart that is read value by value needs.
 */
export const getPath = (coords: number[][], smooth = true): string => {
  if (!coords.length) {
    return "";
  }

  if (!smooth) {
    return coords
      .filter(Boolean)
      .map(([x, y], index) => `${index ? "L" : "M"} ${x},${y}`)
      .join(" ");
  }

  let next: number[];
  let Z: number[];
  const X = 0;
  const Y = 1;
  let path = "";
  let last = coords.filter(Boolean)[0];

  path += `M ${last[X]},${last[Y]}`;

  for (const coord of coords) {
    next = coord;
    Z = midPoint(last[X], last[Y], next[X], next[Y]);
    path += ` ${Z[X]},${Z[Y]}`;
    path += ` Q${next[X]},${next[Y]}`;
    last = next;
  }

  path += ` ${next![X]},${next![Y]}`;
  return path;
};
