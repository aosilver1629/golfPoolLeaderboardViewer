interface PointsTableRow {
  position_start: number;
  position_end: number;
  points: number;
}

interface LeaderboardGolfer {
  golfer_name: string;
  golfer_api_id: string;
  position: number | null;
  position_display: string;
}

/**
 * Get the points for a single position from the points table.
 * Handles ranges like 70-74 = 11 points.
 */
export function getPointsForPosition(
  position: number,
  pointsTable: PointsTableRow[]
): number {
  const row = pointsTable.find(
    (r) => position >= r.position_start && position <= r.position_end
  );
  return row ? row.points : 0;
}

/**
 * Calculate points for each golfer on the leaderboard, handling ties.
 *
 * Tie logic: If N golfers are tied starting at position P,
 * sum the points for positions P through P+N-1, then divide by N.
 * Each tied golfer gets that averaged amount.
 */
export function calculateGolferPoints(
  leaderboard: LeaderboardGolfer[],
  pointsTable: PointsTableRow[]
): Map<string, number> {
  const pointsMap = new Map<string, number>();

  // Group golfers by position (only those with a numeric position)
  const positionGroups = new Map<number, LeaderboardGolfer[]>();
  for (const golfer of leaderboard) {
    if (golfer.position === null) {
      // CUT, WD, DQ — 0 points
      pointsMap.set(golfer.golfer_api_id, 0);
      continue;
    }
    const existing = positionGroups.get(golfer.position) || [];
    existing.push(golfer);
    positionGroups.set(golfer.position, existing);
  }

  // Calculate points for each position group
  for (const [position, golfers] of positionGroups) {
    const tiedCount = golfers.length;

    // Sum points for positions: position, position+1, ..., position+tiedCount-1
    let totalPoints = 0;
    for (let i = 0; i < tiedCount; i++) {
      totalPoints += getPointsForPosition(position + i, pointsTable);
    }

    const pointsPerGolfer = totalPoints / tiedCount;

    for (const golfer of golfers) {
      pointsMap.set(golfer.golfer_api_id, Math.round(pointsPerGolfer * 100) / 100);
    }
  }

  return pointsMap;
}

/**
 * Default points table from the pool rules spreadsheet.
 * Can be used to seed the database.
 */
export const DEFAULT_POINTS_TABLE: PointsTableRow[] = [
  { position_start: 1, position_end: 1, points: 320 },
  { position_start: 2, position_end: 2, points: 270 },
  { position_start: 3, position_end: 3, points: 230 },
  { position_start: 4, position_end: 4, points: 205 },
  { position_start: 5, position_end: 5, points: 190 },
  { position_start: 6, position_end: 6, points: 170 },
  { position_start: 7, position_end: 7, points: 160 },
  { position_start: 8, position_end: 8, points: 150 },
  { position_start: 9, position_end: 9, points: 140 },
  { position_start: 10, position_end: 10, points: 130 },
  { position_start: 11, position_end: 11, points: 110 },
  { position_start: 12, position_end: 12, points: 105 },
  { position_start: 13, position_end: 13, points: 100 },
  { position_start: 14, position_end: 14, points: 95 },
  { position_start: 15, position_end: 15, points: 90 },
  { position_start: 16, position_end: 16, points: 85 },
  { position_start: 17, position_end: 17, points: 80 },
  { position_start: 18, position_end: 18, points: 75 },
  { position_start: 19, position_end: 19, points: 70 },
  { position_start: 20, position_end: 20, points: 65 },
  { position_start: 21, position_end: 21, points: 60 },
  { position_start: 22, position_end: 22, points: 59 },
  { position_start: 23, position_end: 23, points: 58 },
  { position_start: 24, position_end: 24, points: 57 },
  { position_start: 25, position_end: 25, points: 56 },
  { position_start: 26, position_end: 26, points: 55 },
  { position_start: 27, position_end: 27, points: 54 },
  { position_start: 28, position_end: 28, points: 53 },
  { position_start: 29, position_end: 29, points: 52 },
  { position_start: 30, position_end: 30, points: 51 },
  { position_start: 31, position_end: 31, points: 50 },
  { position_start: 32, position_end: 32, points: 49 },
  { position_start: 33, position_end: 33, points: 48 },
  { position_start: 34, position_end: 34, points: 47 },
  { position_start: 35, position_end: 35, points: 46 },
  { position_start: 36, position_end: 36, points: 45 },
  { position_start: 37, position_end: 37, points: 44 },
  { position_start: 38, position_end: 38, points: 43 },
  { position_start: 39, position_end: 39, points: 42 },
  { position_start: 40, position_end: 40, points: 41 },
  { position_start: 41, position_end: 41, points: 40 },
  { position_start: 42, position_end: 42, points: 39 },
  { position_start: 43, position_end: 43, points: 38 },
  { position_start: 44, position_end: 44, points: 37 },
  { position_start: 45, position_end: 45, points: 36 },
  { position_start: 46, position_end: 46, points: 35 },
  { position_start: 47, position_end: 47, points: 34 },
  { position_start: 48, position_end: 48, points: 33 },
  { position_start: 49, position_end: 49, points: 32 },
  { position_start: 50, position_end: 50, points: 31 },
  { position_start: 51, position_end: 51, points: 30 },
  { position_start: 52, position_end: 52, points: 29 },
  { position_start: 53, position_end: 53, points: 28 },
  { position_start: 54, position_end: 54, points: 27 },
  { position_start: 55, position_end: 55, points: 26 },
  { position_start: 56, position_end: 56, points: 25 },
  { position_start: 57, position_end: 57, points: 24 },
  { position_start: 58, position_end: 58, points: 23 },
  { position_start: 59, position_end: 59, points: 22 },
  { position_start: 60, position_end: 60, points: 21 },
  { position_start: 61, position_end: 61, points: 20 },
  { position_start: 62, position_end: 62, points: 19 },
  { position_start: 63, position_end: 63, points: 18 },
  { position_start: 64, position_end: 64, points: 17 },
  { position_start: 65, position_end: 65, points: 16 },
  { position_start: 66, position_end: 66, points: 15 },
  { position_start: 67, position_end: 67, points: 14 },
  { position_start: 68, position_end: 68, points: 13 },
  { position_start: 69, position_end: 69, points: 12 },
  { position_start: 70, position_end: 74, points: 11 },
  { position_start: 75, position_end: 999, points: 10 },
];
