import { downSampleLineData } from "../../../../components/chart/down-sample";
import type { EntityHistoryState } from "../../../../data/history";

const calcPoints = (
  history: [number, number][],
  width: number,
  height: number,
  limits?: { minX?: number; maxX?: number; minY?: number; maxY?: number }
) => {
  // handling empty history (for example unavailable for long time)
  if (history.length === 0) {
    return { points: [], yAxisOrigin: height, minY: 0, maxY: 0 };
  }

  let yAxisOrigin = height;
  let minY = limits?.minY ?? history[0][1];
  let maxY = limits?.maxY ?? history[0][1];
  const minX = limits?.minX ?? history[0][0];
  const maxX = limits?.maxX ?? history[history.length - 1][0];
  history.forEach(([_, stateValue]) => {
    if (stateValue < minY) {
      minY = stateValue;
    } else if (stateValue > maxY) {
      maxY = stateValue;
    }
  });
  const rangeY = maxY - minY || minY * 0.1;
  // add top and bottom margins to prevent cropping
  maxY += rangeY * 0.1;
  minY -= rangeY * 0.1;
  if (maxY < 0) {
    // all values are negative
    maxY = Math.min(0, maxY);
    yAxisOrigin = 0;
  } else if (minY < 0) {
    // some values are negative
    yAxisOrigin = (maxY / (maxY - minY || 1)) * height;
  } else {
    // all values are positive
    minY = Math.max(0, minY);
  }
  const yDenom = maxY - minY || 1;
  const xDenom = maxX - minX || 1;
  const points: [number, number][] = history.map((point) => {
    const x = ((point[0] - minX) / xDenom) * width;
    const y = height - ((point[1] - minY) / yDenom) * height;
    return [x, y];
  });
  points.push([width, points[points.length - 1][1]]);
  // The padded bounds the drawing actually spans, so a caller that labels an
  // axis labels the line it drew rather than the data it started from.
  return { points, yAxisOrigin, minY, maxY };
};

export const coordinates = (
  history: [number, number][],
  width: number,
  height: number,
  maxDetails: number,
  limits?: { minX?: number; maxX?: number; minY?: number; maxY?: number },
  useMean = false
) => {
  history = history.filter((item) => !Number.isNaN(item[1]));

  const sampledData: [number, number][] = downSampleLineData(
    history,
    maxDetails,
    limits?.minX,
    limits?.maxX,
    useMean
  );
  // The sampled series is handed back beside the pixel points, index for
  // index, so a caller that lets the user point at the line can say which
  // value and moment a point stands for.
  return {
    ...calcPoints(sampledData, width, height, limits),
    sampled: sampledData,
  };
};

export const coordinatesMinimalResponseCompressedState = (
  history: EntityHistoryState[] | undefined,
  width: number,
  height: number,
  maxDetails: number,
  limits?: { minX?: number; maxX?: number; minY?: number; maxY?: number },
  useMean = false
) => {
  if (!history?.length) {
    return { points: [], yAxisOrigin: 0, sampled: [], minY: 0, maxY: 0 };
  }
  const mappedHistory: [number, number][] = history.map((item) => [
    // With minimal response and compressed state, we don't have last_changed,
    // so we use last_updated since its always the same as last_changed since
    // we already filtered out states that are the same.
    item.lu * 1000,
    Number(item.s),
  ]);
  return coordinates(mappedHistory, width, height, maxDetails, limits, useMean);
};
