/**
 * astar.js — The one A* grid planner, shared by the browser (LiDAR detours, import from
 * /shared/astar.js) and the server (/api/plan/astar and AI planner routes, require).
 *
 * Course Reference: CAI 4505C / CAI 4510C — Autonomous Mobile Robotics
 * Features:
 *  - 2D grid discretization scaled to environment limits (0.1 m cells)
 *  - 8-connected orthogonal + diagonal movement, binary-heap open list
 *  - Obstacles (both axis-aligned/rotated Keep-Out boxes and exact 2D building/water polygons)
 *    and the environment walls inflated by a safety margin (0.25 m, just over an AMR's 0.226 m
 *    half-width); a cell is blocked when its center is within the margin
 *  - Sidewalk-guided campus navigation (when a scan includes an `isWalkwayNetwork` definition):
 *    concrete sidewalks, lakeside promenades, and crosswalks have low traversal cost (1.0x) while
 *    off-sidewalk grass/roads have high traversal cost (4.5x), and path smoothing preserves
 *    sidewalk bends so robots navigate along sidewalks to reach any trained destination
 *  - String-pulling line-of-sight path pruning / smoothing with the same margin
 *  - Route metrics for the ML transit predictor (see routeMetrics)
 */

// Unit of the ML predictor's path features, kept fixed so retuning the grid doesn't move ETAs.
const MODEL_STEP_M = 0.35;

export class AStarPlanner {
  constructor(options = {}) {
    this.resolution = options.resolution || 0.1; // Meters per grid cell
    this.bounds = options.bounds || { minX: -12.0, maxX: 12.0, minZ: -12.0, maxZ: 12.0 };
    this.safetyMargin = options.safetyMargin || 0.25; // Clearance from obstacles and walls
    this.hasWalkways = false;
    this.walkwayGrid = null;
    this.initGrid();
  }

  setBounds(bounds) {
    if (bounds && typeof bounds.minX === 'number' && typeof bounds.maxX === 'number') {
      if (this.bounds && this.bounds.minX === bounds.minX && this.bounds.maxX === bounds.maxX &&
          this.bounds.minZ === bounds.minZ && this.bounds.maxZ === bounds.maxZ && this.grid) {
        return;
      }
      this.bounds = bounds;
      this.initGrid();
    }
  }

  initGrid() {
    const width = Math.max(1, this.bounds.maxX - this.bounds.minX);
    const depth = Math.max(1, this.bounds.maxZ - this.bounds.minZ);
    this.cols = Math.ceil(width / this.resolution);
    this.rows = Math.ceil(depth / this.resolution);
    this.grid = Array(this.rows).fill(null).map(() => new Uint8Array(this.cols));
    this.walkwayGrid = Array(this.rows).fill(null).map(() => new Uint8Array(this.cols));
    this._cachedGridKey = null;
  }

  worldToGrid(x, z) {
    const col = Math.min(Math.max(0, Math.floor((x - this.bounds.minX) / this.resolution)), this.cols - 1);
    const row = Math.min(Math.max(0, Math.floor((z - this.bounds.minZ) / this.resolution)), this.rows - 1);
    return { row, col };
  }

  gridToWorld(row, col) {
    const x = this.bounds.minX + (col + 0.5) * this.resolution;
    const z = this.bounds.minZ + (row + 0.5) * this.resolution;
    return { x, y: 0.05, z };
  }

  // Whether a point is within the safety margin of a wall, an obstacle box, or a solid polygon.
  isBlocked(x, z, obstacleBoxes, margin = this.safetyMargin) {
    const b = this.bounds;
    if (x < b.minX + margin || x > b.maxX - margin || z < b.minZ + margin || z > b.maxZ - margin) return true;
    for (const ob of obstacleBoxes) {
      if (!ob || ob.isWalkwayNetwork) continue;
      if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
        if (isPointInPolygonObstacle(x, z, ob, margin)) return true;
      } else if (ob.rotY) {
        const p = toBoxFrame(ob, x, z);
        if (Math.abs(p.x) <= (ob.maxX - ob.minX) / 2 + margin && Math.abs(p.z) <= (ob.maxZ - ob.minZ) / 2 + margin) return true;
      } else if (x >= ob.minX - margin && x <= ob.maxX + margin && z >= ob.minZ - margin && z <= ob.maxZ + margin) {
        return true;
      }
    }
    return false;
  }

  // The free cell nearest to (x, z), searched outward ring by ring up to maxRadius meters, as
  // { row, col }, or null. Uses the grid as last built. When walkways exist, prefers a free
  // sidewalk cell within the same ring.
  nearestFreeCell(x, z, maxRadius = 3) {
    const c = this.worldToGrid(x, z);
    const rings = Math.ceil(maxRadius / this.resolution);
    let best = null;
    let bestScore = Infinity;
    for (let r = 0; r <= rings; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
          const row = c.row + dr, col = c.col + dc;
          if (row < 0 || row >= this.rows || col < 0 || col >= this.cols || this.grid[row][col] === 1) continue;
          const p = this.gridToWorld(row, col);
          const d = Math.hypot(p.x - x, p.z - z);
          const score = (this.hasWalkways && this.walkwayGrid[row][col] === 0) ? d + 0.15 : d;
          if (score < bestScore) { bestScore = score; best = { row, col }; }
        }
      }
      if (best && r > Math.ceil((bestScore + 0.2) / this.resolution)) break;
    }
    return best;
  }

  // The point nearest to (x, z) that is clear of every box, polygon, and wall by the safety margin:
  // the point itself if it is, otherwise the center of the nearest free cell. Null if there is none
  // within maxRadius.
  nearestFreePoint(x, z, obstacleBoxes = [], maxRadius = 3) {
    if (!this.isBlocked(x, z, obstacleBoxes)) return { x, y: 0.05, z };
    this.rebuildGrid(obstacleBoxes);
    const cell = this.nearestFreeCell(x, z, maxRadius);
    return cell ? this.gridToWorld(cell.row, cell.col) : null;
  }

  _gridSignature(obstacleBoxes = []) {
    const b = this.bounds;
    let sig = `${b.minX},${b.maxX},${b.minZ},${b.maxZ}|${this.safetyMargin}|${this.resolution}|${obstacleBoxes.length}`;
    for (let i = 0; i < obstacleBoxes.length; i++) {
      const ob = obstacleBoxes[i];
      if (!ob) continue;
      if (ob.isWalkwayNetwork) {
        sig += `;W:${ob.boxes ? ob.boxes.length : 0}:${ob.polylines ? ob.polylines.length : 0}`;
      } else if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
        const p0 = ob.pts[0];
        sig += `;P:${ob.pts.length},${p0[0]},${p0[1]}`;
      } else {
        sig += `;B:${ob.minX},${ob.maxX},${ob.minZ},${ob.maxZ},${ob.rotY || 0}`;
      }
    }
    return sig;
  }

  rebuildGrid(obstacleBoxes = []) {
    const sig = this._gridSignature(obstacleBoxes);
    if (this._cachedGridKey === sig && this.grid && this.walkwayGrid) {
      return;
    }
    this._cachedGridKey = sig;

    for (let r = 0; r < this.rows; r++) {
      const rowArr = this.grid[r];
      const wArr = this.walkwayGrid[r];
      for (let c = 0; c < this.cols; c++) {
        const p = this.gridToWorld(r, c);
        rowArr[c] = this.isBlocked(p.x, p.z, obstacleBoxes) ? 1 : 0;
        wArr[c] = 0;
      }
    }

    const walkwayNets = obstacleBoxes.filter(ob => ob && ob.isWalkwayNetwork);
    this.hasWalkways = walkwayNets.length > 0;
    if (!this.hasWalkways) return;

    const halfBrush = Math.max(1, Math.ceil(0.36 / this.resolution));
    for (const net of walkwayNets) {
      if (Array.isArray(net.boxes)) {
        for (const box of net.boxes) {
          const [minX, maxX, minZ, maxZ] = box;
          const c0 = this.worldToGrid(minX, minZ);
          const c1 = this.worldToGrid(maxX, maxZ);
          const rMin = Math.min(c0.row, c1.row), rMax = Math.max(c0.row, c1.row);
          const colMin = Math.min(c0.col, c1.col), colMax = Math.max(c0.col, c1.col);
          for (let r = rMin; r <= rMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
              if (this.grid[r][c] === 0) this.walkwayGrid[r][c] = 1;
            }
          }
        }
      }
      if (Array.isArray(net.polylines)) {
        for (const poly of net.polylines) {
          for (let i = 0; i < poly.length - 1; i++) {
            const [x0, z0] = poly[i];
            const [x1, z1] = poly[i + 1];
            const dist = Math.hypot(x1 - x0, z1 - z0);
            const steps = Math.max(1, Math.ceil(dist / (this.resolution * 0.5)));
            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const px = x0 + (x1 - x0) * t;
              const pz = z0 + (z1 - z0) * t;
              const centerCell = this.worldToGrid(px, pz);
              for (let dr = -halfBrush; dr <= halfBrush; dr++) {
                const rr = centerCell.row + dr;
                if (rr < 0 || rr >= this.rows) continue;
                for (let dc = -halfBrush; dc <= halfBrush; dc++) {
                  const cc = centerCell.col + dc;
                  if (cc < 0 || cc >= this.cols) continue;
                  if (this.grid[rr][cc] === 0) this.walkwayGrid[rr][cc] = 1;
                }
              }
            }
          }
        }
      }
    }
  }

  // Exact test: the segment stays inside the walls (shrunk by the margin) and misses every
  // obstacle box and solid building/water polygon grown by the margin.
  isLineOfSightClear(p1, p2, obstacleBoxes = []) {
    const m = this.safetyMargin;
    const b = this.bounds;
    const inside = p => p.x >= b.minX + m && p.x <= b.maxX - m && p.z >= b.minZ + m && p.z <= b.maxZ - m;
    if (!inside(p1) || !inside(p2)) return false;
    for (const ob of obstacleBoxes) {
      if (!ob || ob.isWalkwayNetwork) continue;
      if (Array.isArray(ob.pts) && ob.pts.length >= 3) {
        if (segmentHitsPolygon(p1, p2, ob, m)) return false;
      } else if (ob.rotY) {
        const hw = (ob.maxX - ob.minX) / 2 + m, hd = (ob.maxZ - ob.minZ) / 2 + m;
        if (segmentHitsBox(toBoxFrame(ob, p1.x, p1.z), toBoxFrame(ob, p2.x, p2.z), -hw, hw, -hd, hd)) return false;
      } else if (segmentHitsBox(p1, p2, ob.minX - m, ob.maxX + m, ob.minZ - m, ob.maxZ + m)) {
        return false;
      }
    }
    return true;
  }

  // When a scan has sidewalks (this.hasWalkways), a smoothed shortcut between two sidewalk points
  // must stay on the sidewalk corridor so robots follow sidewalk turns instead of cutting across
  // grass lawns or streets.
  isWalkwayLineClear(p1, p2) {
    if (!this.hasWalkways || !this.walkwayGrid) return true;
    const c1 = this.worldToGrid(p1.x, p1.z);
    const c2 = this.worldToGrid(p2.x, p2.z);
    const w1 = this.walkwayGrid[c1.row]?.[c1.col] === 1;
    const w2 = this.walkwayGrid[c2.row]?.[c2.col] === 1;
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    // Allow short local transitions (< 0.45m) onto/off a sidewalk at start or goal
    if (!w1 && !w2 && dist <= 0.65) return true;
    if (!w1 || !w2) return dist <= 0.45;
    const steps = Math.max(2, Math.ceil(dist / (this.resolution * 0.75)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cc = this.worldToGrid(p1.x + (p2.x - p1.x) * t, p1.z + (p2.z - p1.z) * t);
      if (this.walkwayGrid[cc.row]?.[cc.col] !== 1) return false;
    }
    return true;
  }

  smoothPath(rawWaypoints, obstacleBoxes = []) {
    if (!rawWaypoints || rawWaypoints.length <= 2) return rawWaypoints;

    const smoothed = [rawWaypoints[0]];
    let currentIdx = 0;

    while (currentIdx < rawWaypoints.length - 1) {
      let furthestIdx = currentIdx + 1;
      for (let testIdx = rawWaypoints.length - 1; testIdx > currentIdx + 1; testIdx--) {
        if (this.isLineOfSightClear(rawWaypoints[currentIdx], rawWaypoints[testIdx], obstacleBoxes) &&
            this.isWalkwayLineClear(rawWaypoints[currentIdx], rawWaypoints[testIdx])) {
          furthestIdx = testIdx;
          break;
        }
      }
      smoothed.push(rawWaypoints[furthestIdx]);
      currentIdx = furthestIdx;
    }

    return smoothed;
  }

  routeMetrics(waypoints) {
    let pathLengthM = 0;
    let numTurns = 0;
    for (let i = 1; i < waypoints.length; i++) {
      pathLengthM += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].z - waypoints[i - 1].z);
      if (i < waypoints.length - 1) {
        const a1 = Math.atan2(waypoints[i].z - waypoints[i - 1].z, waypoints[i].x - waypoints[i - 1].x);
        const a2 = Math.atan2(waypoints[i + 1].z - waypoints[i].z, waypoints[i + 1].x - waypoints[i].x);
        if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) >= Math.PI / 12) numTurns++;
      }
    }
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const straightM = Math.hypot(last.x - first.x, last.z - first.z);
    return {
      astar_path_len: Number((pathLengthM / MODEL_STEP_M).toFixed(2)),
      path_length_m: Number(pathLengthM.toFixed(3)),
      manhattan_dist: this.manhattanSteps(first, last),
      num_turns: numTurns,
      detour_ratio: straightM > 1e-6 ? Number((pathLengthM / straightM).toFixed(3)) : 1.0
    };
  }

  manhattanSteps(a, b) {
    return Number(((Math.abs(b.x - a.x) + Math.abs(b.z - a.z)) / MODEL_STEP_M).toFixed(2));
  }

  findPath(start, goal, obstacleBoxes = []) {
    const result = this.search(start, goal, obstacleBoxes, null);
    if (result.success) return result;
    const first = this.worldToGrid(start.x, start.z);
    if (!this.isBlocked(start.x, start.z, obstacleBoxes) || this.isBlocked(start.x, start.z, obstacleBoxes, 0)) return result;
    this.rebuildGrid(obstacleBoxes);
    const cell = this.nearestFreeCell(start.x, start.z);
    if (!cell || (cell.row === first.row && cell.col === first.col)) return result;
    const snapped = this.search(start, goal, obstacleBoxes, cell);
    return snapped.success ? snapped : result;
  }

  // One A* search from start (or from startCell, when given) to goal.
  search(start, goal, obstacleBoxes, startCell) {
    this.rebuildGrid(obstacleBoxes);

    const s = startCell || this.worldToGrid(start.x, start.z);
    const g = this.worldToGrid(goal.x, goal.z);

    // Free start and goal cells temporarily for this search
    const prevS = this.grid[s.row][s.col];
    const prevG = this.grid[g.row][g.col];
    this.grid[s.row][s.col] = 0;
    this.grid[g.row][g.col] = 0;

    // 8-connected neighbors (cardinal + diagonal)
    const neighbors = [
      { dr: -1, dc: 0, cost: 1.0 },
      { dr: 1,  dc: 0, cost: 1.0 },
      { dr: 0,  dc: 1, cost: 1.0 },
      { dr: 0,  dc: -1, cost: 1.0 },
      { dr: -1, dc: 1, cost: 1.414 },
      { dr: -1, dc: -1, cost: 1.414 },
      { dr: 1,  dc: 1, cost: 1.414 },
      { dr: 1,  dc: -1, cost: 1.414 }
    ];

    const openSet = [{
      row: s.row,
      col: s.col,
      g: 0,
      h: Math.hypot(s.row - g.row, s.col - g.col),
      f: Math.hypot(s.row - g.row, s.col - g.col),
      parent: null
    }];

    const closedSet = new Uint8Array(this.rows * this.cols);
    const gScores = new Float32Array(this.rows * this.cols).fill(Infinity);
    gScores[s.row * this.cols + s.col] = 0;

    let targetNode = null;
    let nodeExpansions = 0;

    while (openSet.length > 0) {
      const current = heapPop(openSet);
      const currentIdx = current.row * this.cols + current.col;
      if (closedSet[currentIdx] === 1) continue;
      nodeExpansions++;

      if (current.row === g.row && current.col === g.col) {
        targetNode = current;
        break;
      }

      closedSet[currentIdx] = 1;

      for (const n of neighbors) {
        const nr = current.row + n.dr;
        const nc = current.col + n.dc;

        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
        if (this.grid[nr][nc] === 1) continue;
        if (n.dr !== 0 && n.dc !== 0 &&
            (this.grid[current.row + n.dr][current.col] === 1 || this.grid[current.row][current.col + n.dc] === 1)) continue;

        const nIdx = nr * this.cols + nc;
        if (closedSet[nIdx] === 1) continue;

        // Sidewalk-guided step cost: concrete sidewalks/promenades/crosswalks cost 1.0x,
        // whereas off-sidewalk grass/asphalt costs 4.5x so robots stay on the sidewalks.
        const terrainMult = (this.hasWalkways && this.walkwayGrid[nr][nc] === 0) ? 4.5 : 1.0;
        const tentativeG = current.g + n.cost * terrainMult;
        if (tentativeG < gScores[nIdx]) {
          gScores[nIdx] = tentativeG;
          const h = Math.hypot(nr - g.row, nc - g.col);
          const nextNode = {
            row: nr,
            col: nc,
            g: tentativeG,
            h: h,
            f: tentativeG + h * 1.05,
            parent: current
          };
          heapPush(openSet, nextNode);
        }
      }
    }

    this.grid[s.row][s.col] = prevS;
    this.grid[g.row][g.col] = prevG;

    if (!targetNode) {
      return {
        success: false,
        waypoints: [goal],
        path: [],
        astar_path_len: 0,
        path_length_m: 0,
        manhattan_dist: this.manhattanSteps(start, goal),
        num_turns: 0,
        detour_ratio: 0,
        nodeExpansions
      };
    }

    const rawPath = [];
    let curr = targetNode;
    while (curr) {
      rawPath.unshift(curr);
      curr = curr.parent;
    }

    const rawWaypoints = rawPath.map(p => this.gridToWorld(p.row, p.col));
    if (startCell) rawWaypoints.unshift({ x: start.x, y: 0.05, z: start.z });
    else rawWaypoints[0] = { x: start.x, y: 0.05, z: start.z };
    rawWaypoints[rawWaypoints.length - 1] = { x: goal.x, y: 0.05, z: goal.z };

    const smoothedWaypoints = this.smoothPath(rawWaypoints, obstacleBoxes);

    return {
      success: true,
      waypoints: smoothedWaypoints,
      path: rawPath.map(p => ({ row: p.row, col: p.col })),
      ...this.routeMetrics(smoothedWaypoints),
      nodeExpansions
    };
  }
}

// ============================================================================
// EXACT 2D POLYGON GEOMETRY HELPERS (Shared by A* Planner, Collisions & LiDAR)
// ============================================================================

export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1];
    const xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToSegmentSq(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const cx = ax + t * dx, cz = az + t * dz;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

export function isPointInPolygonObstacle(x, z, ob, margin = 0) {
  if (x < ob.minX - margin || x > ob.maxX + margin || z < ob.minZ - margin || z > ob.maxZ + margin) {
    return false;
  }
  const pts = ob.pts;
  if (pointInPolygon(x, z, pts)) return true;
  if (margin <= 0) return false;
  const mSq = margin * margin;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (distToSegmentSq(x, z, a[0], a[1], b[0], b[1]) <= mSq) return true;
  }
  return false;
}

export function segmentHitsPolygon(p1, p2, ob, margin = 0) {
  if (!segmentHitsBox(p1, p2, ob.minX - margin, ob.maxX + margin, ob.minZ - margin, ob.maxZ + margin)) {
    return false;
  }
  const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const steps = Math.max(1, Math.ceil(dist / 0.05));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isPointInPolygonObstacle(p1.x + (p2.x - p1.x) * t, p1.z + (p2.z - p1.z) * t, ob, margin)) {
      return true;
    }
  }
  return false;
}

// Physical collision resolution against an exact 2D polygon obstacle (`ob.pts`).
// Pushes `pos` ({ x, z }) out to `radius` distance from the nearest polygon wall segment.
export function resolvePolygonCollision(pos, radius, ob) {
  if (pos.x < ob.minX - radius || pos.x > ob.maxX + radius || pos.z < ob.minZ - radius || pos.z > ob.maxZ + radius) {
    return false;
  }
  const pts = ob.pts;
  const inside = pointInPolygon(pos.x, pos.z, pts);
  let bestDistSq = Infinity;
  let bestCx = pos.x, bestCz = pos.z;
  let bestNx = 0, bestNz = 1;

  for (let i = 0, n = pts.length; i < n; i++) {
    const ax = pts[i][0], az = pts[i][1];
    const bx = pts[(i + 1) % n][0], bz = pts[(i + 1) % n][1];
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-12 ? Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.z - az) * dz) / lenSq)) : 0;
    const cx = ax + t * dx, cz = az + t * dz;
    const dSq = (pos.x - cx) * (pos.x - cx) + (pos.z - cz) * (pos.z - cz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestCx = cx;
      bestCz = cz;
      const len = Math.sqrt(lenSq) || 1;
      bestNx = -dz / len;
      bestNz = dx / len;
    }
  }

  if (!inside && bestDistSq >= radius * radius) return false;

  const d = Math.sqrt(bestDistSq);
  if (inside) {
    // Point is inside polygon: push outward past closest boundary point (bestCx, bestCz)
    let vx = bestCx - pos.x, vz = bestCz - pos.z;
    const vLen = Math.hypot(vx, vz);
    if (vLen > 1e-6) {
      vx /= vLen;
      vz /= vLen;
    } else {
      vx = bestNx;
      vz = bestNz;
    }
    pos.x = bestCx + vx * (radius + 0.01);
    pos.z = bestCz + vz * (radius + 0.01);
  } else {
    // Point is outside polygon but within `radius` of wall: push away from (bestCx, bestCz)
    let vx = pos.x - bestCx, vz = pos.z - bestCz;
    const vLen = Math.hypot(vx, vz);
    if (vLen > 1e-6) {
      vx /= vLen;
      vz /= vLen;
    } else {
      vx = bestNx;
      vz = bestNz;
    }
    pos.x = bestCx + vx * radius;
    pos.z = bestCz + vz * radius;
  }
  return true;
}

// Exact 2D ray intersection against all edges of a polygon obstacle (`ob.pts`).
// Returns the smallest positive hit distance < maxDist, or null if no hit.
export function rayHitsPolygon(ox, oz, dx, dz, maxDist, ob) {
  // Fast ray-AABB broadphase
  let tmin = 0, tmax = maxDist;
  if (Math.abs(dx) < 1e-8) {
    if (ox < ob.minX || ox > ob.maxX) return null;
  } else {
    let t1 = (ob.minX - ox) / dx, t2 = (ob.maxX - ox) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-8) {
    if (oz < ob.minZ || oz > ob.maxZ) return null;
  } else {
    let t1 = (ob.minZ - oz) / dz, t2 = (ob.maxZ - oz) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmin > tmax || tmax < 0) return null;

  const pts = ob.pts;
  let bestT = null;
  for (let i = 0, n = pts.length; i < n; i++) {
    const ax = pts[i][0], az = pts[i][1];
    const bx = pts[(i + 1) % n][0], bz = pts[(i + 1) % n][1];
    const sx = bx - ax, sz = bz - az;
    const denom = dx * sz - dz * sx;
    if (Math.abs(denom) < 1e-10) continue;
    const qpx = ax - ox, qpz = az - oz;
    const t = (qpx * sz - qpz * sx) / denom;
    const u = (qpx * dz - qpz * dx) / denom;
    if (t > 0.01 && t < maxDist && u >= 0 && u <= 1) {
      if (bestT === null || t < bestT) bestT = t;
    }
  }
  return bestT;
}

function toBoxFrame(ob, x, z) {
  const dx = x - (ob.minX + ob.maxX) / 2;
  const dz = z - (ob.minZ + ob.maxZ) / 2;
  const a = -ob.rotY * Math.PI / 180;
  return { x: dx * Math.cos(a) - dz * Math.sin(a), z: dx * Math.sin(a) + dz * Math.cos(a) };
}

function segmentHitsBox(p1, p2, minX, maxX, minZ, maxZ) {
  let t0 = 0;
  let t1 = 1;
  for (const [start, delta, lo, hi] of [[p1.x, p2.x - p1.x, minX, maxX], [p1.z, p2.z - p1.z, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-12) {
      if (start < lo || start > hi) return false;
    } else {
      let a = (lo - start) / delta;
      let c = (hi - start) / delta;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].f <= heap[i].f) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l].f < heap[m].f) m = l;
      if (r < heap.length && heap[r].f < heap[m].f) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}
