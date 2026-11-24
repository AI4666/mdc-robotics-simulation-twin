# Ricardo Molina Gonzalez: work log

**Role:** AnyLogic model, simulation experiments, calibration, AnyLogic ↔ 3D bridge, documentation.
**Branch:** `ricardo` · **Model:** [`anylogic_model/campus_courier/`](anylogic_model/campus_courier/README.md)

---

## ✅ Completed

### 1. Option 2 AnyLogic model: `MDC_Campus_Courier.alp`
A new model of the **MDC North Campus mail service** (it replaces the Option 1 lab model).
- **DES:** mailroom flowchart in the **Duplicating & Mail Center, Building 3, Room 3103**:
  `mailArrivals` (Source) → `mailSorting` (Service, **3 clerks**) → `sortedMail` (Sink).
- **Vendors, every working day:**
  - USPS around 10:00
  - Amazon 2–3 drops
  - UPS and FedEx
  - newspapers before 8:00
  - 0–2 other vendors

  A late truck after 16:00 is sorted the next day.
- **ABM, robots:** `Rover` agents with a statechart (Idle → Loading → InTransit → Handoff → Returning → WaitingCharger → Charging).
  - Each robot carries **5 package slots**; **25 letters share 1 slot** (one bundle per building).
  - Battery per km, 2 charging pads.
- **ABM, students:** `Walker` agents walk between buildings: about 10 normally, **60 at every class change**. Robots slow down on
  crowded walkway segments.
- **Delivery:** to a **locker at each building**, and office staff collect from it. A full locker sends the mail back.
- **Real data:**
  - offices per building from the **MDC North directory**: Bldg 1 = 25, Bldg 2 = 9, Bldg 4 = 4, Bldg 7 = 3, A (Science) = 2, J (Justice) = 1…
  - the map = the 3D twin's walkway graph, plus Building J
  - my own experience as a former MDC Testing Center employee
- **Time:** 30 working days. The daily KPIs go to `output/daily_kpis.csv`, and the charts keep the whole month (plus a day-by-day chart).

### 2. Dispatch policies and reinforcement learning
`dispatchPolicy`: **0** baseline (send at once, 1 building per trip) · **1** batching rule · **2 Q-learning inside
AnyLogic** (288 states × 4 actions, 1 episode = 1 day, saves `q_table.csv`) · **3** PPO hook for Jordan.

### 3. The 5 course experiments, each with live charts
| Experiment | What it answers | Charts |
|---|---|---|
| `Optimization_FleetSize` | Cheapest robots / pads / batching that keep ≥ 95% same-day delivery | cost per iteration + best, cost vs. robots, same-day % |
| `CompareRuns_Policies` | Baseline vs. batching vs. Q-learning on the same mail | km, hours, cost and same-day % per policy |
| `MonteCarlo_Month` | Risk range over **100** random months, with **95% confidence intervals** | 4 histograms |
| `Sensitivity_AmazonVolume` | What if Amazon volume grows from 10 to 60 packages a day? | 4 scatter charts |
| `Sensitivity_BatteryDischarge` | What if batteries drain faster (5 → 20 % per km)? | 4 scatter charts |
| `Calibration_TravelTime` | Match my observed walking times | error per iteration, simulated vs. observed |

Each experiment writes `output/exp_*.csv` (same 19 columns) for the dashboard.

### Issue #1 extras
- **Optional urgent tier** (`urgentSharePct`, off by default; 15-min deadline): urgent mail leaves immediately and its on-time % is reported.
- **`Depleted` robot state:** an empty battery stops the robot, and staff tow it back after `depletedRescueMinutes`.
- **Battery use 0.8 %/min** while traveling, as in Issue #1.

### 4. Calibration with real data
My observed walk from the mailroom (Building 3) to the Testing Center (Building 1) is **4 min quiet and 7 min at class change**.
OptQuest (40 iterations) found a **map scale of 49.4 m/unit** and a **crowd slow-down of 0.449 per student**, which reproduce
3.9 min and 7.1 min. These are now the model defaults.

### 5. AnyLogic → 3D digital twin (live)
- **In the model:** with `enableTwinBridge` on, it sends every robot (position, heading, battery, status, items, slots) and every walking student to
  the 3D server, on a background thread, at most about 12 updates a second.
- **In the 3D app** (`digital_twin_app/`): **AnyLogic mode**
  - the robots and students follow AnyLogic smoothly, and the browser's own simulation pauses for them
  - a green "AnyLogic LIVE" banner shows the clock and speed
  - the app goes back to normal 5 s after AnyLogic stops
- **Speed bar** (bottom right), like AnyLogic's: ×1–×20 for the 3D app's own simulation, and **×10–×600 sends the speed to AnyLogic**.
- Tested in the browser; the 3D app's test suite shows no new failures.

### 6. Repository cleanup and handoff
- Option 1 material moved to `archive/option1_lab/` (nothing deleted).
- Main README rewritten for Option 2.
- [`HANDOFF.md`](HANDOFF.md) for the team, with the shared data formats and tasks for Jordan, Illia and Jorge.

---

## 🔜 Future implementation

1. **Parameters app (next step, if time allows):** a small app (Streamlit or a web form) to set the main inputs
   before a run, written to a file the AnyLogic model reads at startup. Inputs:
   - number of robots, pads
   - vendor volumes, Amazon growth
   - batching %
   - cost assumptions
   - dispatch policy, days

   This also gives Illia's dashboard a real "inputs" tab.
2. **Final experiment runs** with the calibrated model, replacing the files in `anylogic_model/exports/` (those are test runs from before calibration).
3. **PPO inside AnyLogic:** write the forward pass in `ppoAction()` from Jordan's `ppo_policy.json`, then compare
   Q-learning vs. PPO in Compare Runs.
4. **Building J position:** confirm it on the 3D map with Jorge.
5. **More real data** (optional): daily mail volumes per vendor from the mailroom, and locker pickup times.
6. **Report (2–3 pages) and slides:** problem, multi-method design, calibration, experiment results, recommendations,
   limitations, AI use statement.

---

## Notes for working on the model
- Edit with AnyLogic or the AnyLogic CLI (`cli-anything-anylogic`). **Save + close in AnyLogic before any file edit.**
- Don't re-run `build_campus_courier.py` (a one-time scaffold; it would overwrite the model).
- Backups (`*.bak`) and run results (`output/`) stay out of git.
