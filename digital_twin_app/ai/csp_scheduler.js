/**
 * csp_scheduler.js — Constraint Satisfaction Problem (CSP) Fleet Scheduler
 * 
 * Course Reference: CAI 4505C — Artificial Intelligence (Miami Dade College)
 * Based on: "Autonomous Campus Delivery Planning: Integrating Heuristic Search and Constraint Satisfaction"
 * 
 * Features:
 *  - Variables X: Delivery mission jobs {JOB-101 .. JOB-105}
 *  - Domains D: Permissible shift time slots (08:00 to 17:00)
 *  - Constraints C: Unary delivery window bounds & binary robot resource non-overlap
 *  - MRV (Minimum Remaining Values) heuristic: Fail-first variable ordering
 *  - Forward Checking (FC): Proactive domain pruning eliminating search backtracking
 *  - Integrates ML predicted transit buffers to prevent schedule cascades
 */

const DEFAULT_SAMPLE_JOBS = [
  {
    id: 'JOB-101',
    cargo: 'Chemistry Lab Reagents',
    robot_id: 'AMR-01',
    start_grid: { row: 0, col: 1 },
    goal_grid: { row: 10, col: 10 },
    start_station: 'inventory',
    goal_station: 'testing',
    payload_weight_kg: 2.4,
    allowed_start_hour: 8,
    allowed_end_hour: 12
  },
  {
    id: 'JOB-102',
    cargo: 'Bookstore Course Reserves',
    robot_id: 'AMR-01',
    start_grid: { row: 2, col: 2 },
    goal_grid: { row: 9, col: 2 },
    start_station: 'electronics',
    goal_station: 'inventory',
    payload_weight_kg: 8.1,
    allowed_start_hour: 9,
    allowed_end_hour: 13
  },
  {
    id: 'JOB-103',
    cargo: 'Admin Official Records',
    robot_id: 'AMR-02',
    start_grid: { row: 8, col: 1 },
    goal_grid: { row: 1, col: 8 },
    start_station: 'electronics',
    goal_station: 'testing',
    payload_weight_kg: 1.2,
    allowed_start_hour: 9,
    allowed_end_hour: 14
  },
  {
    id: 'JOB-104',
    cargo: 'Clinic Diagnostic Supplies',
    robot_id: 'AMR-02',
    start_grid: { row: 4, col: 2 },
    goal_grid: { row: 8, col: 8 },
    start_station: 'inventory',
    goal_station: 'charger',
    payload_weight_kg: 3.6,
    allowed_start_hour: 10,
    allowed_end_hour: 15
  },
  {
    id: 'JOB-105',
    cargo: 'Robotics Lab Hardware',
    robot_id: 'AMR-01',
    start_grid: { row: 1, col: 10 },
    goal_grid: { row: 10, col: 2 },
    start_station: 'testing',
    goal_station: 'electronics',
    payload_weight_kg: 4.8,
    allowed_start_hour: 12,
    allowed_end_hour: 17
  }
];

class CSPScheduler {
  constructor(options = {}) {
    this.shiftStartHour = options.shiftStartHour || 8;
    this.shiftEndHour = options.shiftEndHour || 17;
    
    // Master operational time slots [8, 9, 10, 11, 12, 13, 14, 15, 16]
    this.timeSlots = [];
    for (let h = this.shiftStartHour; h < this.shiftEndHour; h++) {
      this.timeSlots.push(h);
    }
  }

  /**
   * Format integer hour to 24-hr time string (e.g. 8 -> '08:00')
   */
  static formatHour(hour) {
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  /**
   * Initializes initial domains for all jobs enforcing unary window constraints
   */
  initializeDomains(jobs) {
    const domains = {};
    for (const job of jobs) {
      const validSlots = this.timeSlots.filter(hour => 
        hour >= job.allowed_start_hour && hour < job.allowed_end_hour
      );
      domains[job.id] = [...validSlots];
    }
    return domains;
  }

  /**
   * Minimum Remaining Values (MRV) Variable Ordering Heuristic
   * Selects the unassigned job with the smallest remaining domain ('fail-first')
   */
  selectUnassignedVariableMRV(unassignedJobIds, domains) {
    let bestJobId = null;
    let minDomainSize = Infinity;

    for (const jId of unassignedJobIds) {
      const size = domains[jId].length;
      if (size < minDomainSize) {
        minDomainSize = size;
        bestJobId = jId;
      }
    }
    return bestJobId;
  }

  /**
   * Forward Checking (FC) Domain Pruner
   * When slot `assignedHour` is tentatively given to `jobId`, prune conflicting
   * time slots from all peer jobs that share the same physical robot.
   * 
   * @returns {Object|null} Pruned domains map, or null if any domain wiped out (failure)
   */
  forwardCheck(assignment, assignedJobId, assignedHour, domains, jobsMap, requiredSlotDurations) {
    const newDomains = {};
    for (const id of Object.keys(domains)) {
      newDomains[id] = [...domains[id]];
    }

    const assignedJob = jobsMap[assignedJobId];
    const durationSlots = requiredSlotDurations[assignedJobId] || 1;
    const occupiedHours = new Set();
    for (let offset = 0; offset < durationSlots; offset++) {
      occupiedHours.add(assignedHour + offset);
    }

    // Prune for each unassigned job sharing the same robot resource
    for (const otherJobId of Object.keys(newDomains)) {
      if (assignment[otherJobId] !== undefined) continue; // Already assigned
      if (otherJobId === assignedJobId) continue;

      const otherJob = jobsMap[otherJobId];
      if (otherJob.robot_id === assignedJob.robot_id) {
        // Remove any slot that overlaps with occupied hours
        newDomains[otherJobId] = newDomains[otherJobId].filter(slotHour => {
          const otherDuration = requiredSlotDurations[otherJobId] || 1;
          for (let o = 0; o < otherDuration; o++) {
            if (occupiedHours.has(slotHour + o)) {
              return false; // Conflict! Prune.
            }
          }
          return true;
        });

        // Forward checking domain wipe-out detection
        if (newDomains[otherJobId].length === 0) {
          return null; // Branch failure: immediate backtrack without exploration
        }
      }
    }

    return newDomains;
  }

  /**
   * Recursive Backtracking CSP Solver with MRV and Forward Checking
   */
  backtrack(assignment, unassignedJobIds, domains, jobsMap, requiredSlotDurations, stats) {
    if (unassignedJobIds.length === 0) {
      return assignment; // All jobs assigned! Solution found.
    }

    // 1. Select unassigned variable via MRV
    const jobId = this.selectUnassignedVariableMRV(unassignedJobIds, domains);
    const domainValues = [...domains[jobId]];

    // 2. Iterate through legal domain values
    for (const slotHour of domainValues) {
      stats.assignmentAttempts++;

      // 3. Forward Checking inference
      const prunedDomains = this.forwardCheck(
        assignment,
        jobId,
        slotHour,
        domains,
        jobsMap,
        requiredSlotDurations
      );

      if (prunedDomains !== null) {
        // Forward check passed! Make assignment
        assignment[jobId] = slotHour;
        const remainingUnassigned = unassignedJobIds.filter(id => id !== jobId);

        const result = this.backtrack(
          assignment,
          remainingUnassigned,
          prunedDomains,
          jobsMap,
          requiredSlotDurations,
          stats
        );

        if (result !== null) {
          return result;
        }

        // Backtrack
        delete assignment[jobId];
        stats.backtracks++;
      }
    }

    return null; // Inconsistent branch
  }

  /**
   * Solves delivery mission schedule with dynamic ML predictive buffering
   * 
   * @param {Array} jobs - List of delivery missions
   * @param {Object} mlPredictions - Map of jobId -> { predicted_delivery_time_min, recommended_buffer_min }
   * @returns {Object} Master schedule, timeline, and solving benchmarks
   */
  scheduleFleet(jobs = DEFAULT_SAMPLE_JOBS, mlPredictions = {}) {
    const startTime = performance.now();
    const jobsMap = {};
    const requiredSlotDurations = {};

    jobs.forEach(j => {
      jobsMap[j.id] = j;
      // If ML predicts long transit (e.g. > 50 min), allocate 2 slots, otherwise standard 1 slot
      const pred = mlPredictions[j.id];
      if (pred && pred.recommended_buffer_min > 50) {
        requiredSlotDurations[j.id] = 2;
      } else {
        requiredSlotDurations[j.id] = 1;
      }
    });

    const initialDomains = this.initializeDomains(jobs);
    const unassignedJobIds = jobs.map(j => j.id);
    const assignment = {};
    const stats = { assignmentAttempts: 0, backtracks: 0 };

    const solution = this.backtrack(
      assignment,
      unassignedJobIds,
      initialDomains,
      jobsMap,
      requiredSlotDurations,
      stats
    );

    const solveTimeMs = Number((performance.now() - startTime).toFixed(3));

    if (!solution) {
      return {
        success: false,
        error: 'No conflict-free schedule satisfies all constraints.',
        stats: { ...stats, solveTimeMs }
      };
    }

    // Build timeline output matching research paper Table 3
    const masterSchedule = [];
    for (const job of jobs) {
      const assignedSlot = solution[job.id];
      const duration = requiredSlotDurations[job.id] || 1;
      masterSchedule.push({
        job_id: job.id,
        cargo: job.cargo,
        robot_id: job.robot_id,
        time_slot: CSPScheduler.formatHour(assignedSlot),
        time_slot_hour: assignedSlot,
        end_time_slot: CSPScheduler.formatHour(assignedSlot + duration),
        payload_weight_kg: job.payload_weight_kg,
        start_station: job.start_station,
        goal_station: job.goal_station,
        allowed_window: `${CSPScheduler.formatHour(job.allowed_start_hour)} - ${CSPScheduler.formatHour(job.allowed_end_hour)}`,
        ml_prediction: mlPredictions[job.id] || null
      });
    }

    // Sort chronologically by assigned hour, then by robot_id
    masterSchedule.sort((a, b) => a.time_slot_hour - b.time_slot_hour || a.robot_id.localeCompare(b.robot_id));

    return {
      success: true,
      masterSchedule,
      stats: {
        totalJobs: jobs.length,
        assignmentAttempts: stats.assignmentAttempts,
        backtracks: stats.backtracks,
        solveTimeMs
      }
    };
  }
}

// Support CommonJS & ES Module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CSPScheduler, DEFAULT_SAMPLE_JOBS };
}
