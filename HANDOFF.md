# Team handoff: MDC North Campus Mail Robots (Option 2)

*Written by Ricardo, Nov 23, 2026.* This is what exists, what each person does next, and the **data formats**
we share, so the AnyLogic model, the RL training, the dashboard and the 3D twin fit together.

---

## 1. Where the project stands

| Part | Status | Owner |
|---|---|---|
| AnyLogic model (DES + ABM), 30 working days | ✅ Working, calibrated with real data | Ricardo |
| 5 experiment types with charts (Optimization, Compare Runs, Monte Carlo ×100 + 95% CI, Sensitivity ×2, Calibration) | ✅ Working | Ricardo |
| Q-learning dispatcher inside AnyLogic (`dispatchPolicy = 2`) | ✅ Working, learns 1 episode per day | Ricardo → **Jordan to analyze/tune** |
| PPO policy (`dispatchPolicy = 3`) | ⏳ Hook ready, policy to be trained | **Jordan** |
| 3D twin follows AnyLogic live + speed bar | ✅ Working | Jorge (app) / Ricardo (AnyLogic mode) |
| Streamlit dashboard for Option 2 | ⏳ To build (current `dashboard/app.py` is Option 1 with made-up numbers) | **Illia** |
| RL environment for Option 2 | ⏳ To build (current `rl_models/` is the Option 1 lab env) | **Jordan** |
| Parameters app (set inputs before a run) | 🔜 Next step if time allows | Ricardo |
| Report (2–3 pages) + slides | ⏳ After final runs | All |

---

## 2. The system in one paragraph

Vendors drop mail at the **Duplicating & Mail Center (Building 3, Room 3103)** every working day:
- **USPS** around 10:00 (letters plus small packages)
- **Amazon** 2–3 times a day
- **UPS** and **FedEx** in the morning
- **newspapers** before 8:00
- 0–2 **other vendors**

A drop after 16:00 is sorted the next day. **3 clerks** sort the mail (DES flowchart). **Courier robots** carry
**5 package slots** each (**25 letters = 1 slot**) along the campus walkways to a **locker at each building**, and office
staff collect from the lockers. **Students** crowd the walkways at every class change (last 10 min of each hour)
and slow the robots (ABM). Mail volume per building is proportional to its number of offices (MDC North directory).
Robots charge on 2 pads at the mailroom.

**Calibrated with Ricardo's experience:** the Building 3 → Building 1 walk takes 4 min when quiet and 7 min at class change,
giving a map scale of 49.4 m/unit and a crowd slow-down of 0.449 per student.

### Distances from the mailroom (calibrated model)
| Building | Offices | Share of mail | Walkway distance (m) | Robot one way, no crowd (min) |
|---|---|---|---|---|
| 1 Administration | 25 | 52% | 198 | 2.8 |
| 2 Library | 9 | 19% | 330 | 4.6 |
| 3 Mailroom (delivered inside) | 2 | 4% | 0 | 0 |
| 4 Student Life | 4 | 8% | 187 | 2.6 |
| 5 Arts | 1 | 2% | 255 | 3.5 |
| 6 ACCESS | 1 | 2% | 158 | 2.2 |
| 7 English / Math | 3 | 6% | 128 | 1.8 |
| A Science | 2 | 4% | 292 | 4.1 |
| J Justice | 1 | 2% | 193 | 2.7 |
| 8, 9 | 0 | 0% | 171 / 225 | — |

---

## 3. How to run everything

1. **AnyLogic:** open `anylogic_model/campus_courier/MDC_Campus_Courier.alp` (AnyLogic 8.9, the Personal Learning Edition is fine) → run
   **Simulation** or one of the 5 experiments. CSV results go to `anylogic_model/campus_courier/output/`.
2. **3D twin:** `cd digital_twin_app` → `npm install` → `npm start` → http://localhost:3000. In AnyLogic, tick
   `enableTwinBridge` and Run. You'll see the green "AnyLogic LIVE" banner, and the ⏩ speed bar sets AnyLogic's speed.
3. **Never edit the `.alp` while it's open in AnyLogic.** Save + close first (AnyLogic saves its in-memory copy before every
   Run and will overwrite file edits). Don't re-run `build_campus_courier.py`; it would overwrite the model.

---

## 4. Shared data formats (keep these stable)

### 4.1 `output/daily_kpis.csv`: one row per simulated day (written by every Simulation run)
| Column | Meaning |
|---|---|
| `day`, `policy` | day number (1…30); dispatch policy: 0 baseline, 1 batching, 2 Q-learning, 3 PPO |
| `arrived`, `eligible` | mail items that arrived today; those arriving before the 16:00 cut-off |
| `same_day`, `same_day_pct` | eligible items in a locker the same day (count, %) |
| `delivered`, `avg_hours_to_locker` | items put in lockers today; average hours from vendor drop to locker |
| `left_in_mailroom`, `max_in_mailroom` | items still in the mailroom at 17:30; daily peak |
| `late_drops` | vendor drops after 16:00 (sorted tomorrow) |
| `robot_km`, `energy_pct` | robot distance today; battery used today (% of one battery) |
| `locker_full_events`, `clerk_util_pct` | times a locker was full; clerk utilization |
| `q_reward`, `q_epsilon` | Q-learning reward of the day; exploration rate (policy 2) |

### 4.2 `output/exp_*.csv`: one row per run, same 21 columns in every experiment
`exp_optimization.csv`, `exp_compare_runs.csv`, `exp_monte_carlo.csv` (100 runs), `exp_sensitivity.csv` (Amazon volume),
`exp_sensitivity_battery.csv` (battery discharge), `exp_calibration.csv`

`policy, robots, pads, batch_fill_pct, amazon_per_day, meters_per_unit, crowd_impact, work_days, arrived, delivered,
same_day_pct, late_items, avg_hours_to_locker, robot_km, energy_pct, monthly_cost, sim_trip_quiet_min, sim_trip_rush_min, calibration_error,
urgent_on_time_pct, depleted_events`

(The last two columns were added for Issue #1; the files in `anylogic_model/exports/` predate them and have 19 columns.)

- `monthly_cost` = robots × $35/day × days + energy + $5 per late item + $0.25 per item-hour waiting. All the costs are **assumptions** (parameters).
- **Sample files** in the final format: `anylogic_model/exports/` (the export folder from `docs/API_CONTRACT.md`). They come from test runs *before*
  calibration, so use them to build and test; final numbers will come from re-runs.

### 4.3 `output/q_table.csv`: the learned Q-table (policy 2)
`state, wait, send_one, send_all, charge` with 288 rows. AnyLogic can load it back (`rlLoadQTable = true`), so
**a Q-table trained in Python in this format can be run inside AnyLogic.**

### 4.4 3D twin / live API (Node server, port 3000): see also Jorge's `docs/API_CONTRACT.md`
Our bridge follows the contract (IDs `AMR-01…06`, x/z floor plane, `y = 0.05`) and only **adds** fields (`cargo`, `slots`,
`pedestrians`, `clock`, `simTime`, and `requestedScale` in the reply). **One difference:** `heading` is in **radians**
(0 = facing +z), because the 3D app rotates the meshes in radians (`mesh.rotation.y = heading`). The contract's example
sends degrees, which would turn the robots the wrong way. Please update the contract to radians.
| Endpoint | Use |
|---|---|
| `POST /api/anylogic/update` | AnyLogic → server: `{source:"AnyLogic", simTime, clock, robots:[{id:"AMR-01", x, y, z, heading, battery, speed, status, cargo, slots}], pedestrians:[{id, x, z}]}`; reply `{success, count, requestedScale}` |
| `GET /api/robots` | current robot list (id, x, z, battery, status, …): **for the dashboard's live tab** |
| `POST /api/anylogic/speed` `{scale}` / `GET` | speed requested from the 3D view (AnyLogic applies it) |

---

## 5. Jordan: reinforcement learning (Q-learning vs. PPO)

**Important:** the current `rl_models/` is still **Option 1** (lab stations, 8-number state, 5 actions). Also, the
committed `ppo_results.json` was produced by the **scripted fallback** in `train_ppo.py` (when Stable-Baselines3 isn't
installed it runs a hand-written rule), **not by PPO**. Install `stable-baselines3` and retrain for Option 2.

**The decision to learn (same as the AnyLogic Q-learning):** every **5 minutes** between 08:00 and 17:00 (one episode = one
working day, about 108 decisions), the dispatcher picks:

| Action | Meaning |
|---|---|
| 0 `wait` | do nothing now (let more mail pile up for fuller trips) |
| 1 `send_one` | send one free robot with a full load (fullest building first, then nearest buildings) |
| 2 `send_all` | send every free robot |
| 3 `charge` | send the lowest-battery free robot to charge |

**State in AnyLogic** (tabular, 288 states = 4·3·3·4·2):
- sorted mail waiting, in robot slots: 0 / <2 / <5 / ≥5
- free robots: 0 / 1 / 2+
- average battery: <40 / <70 / ≥70 %
- time block: <10 / <12 / <14 / ≥14 h
- class change in ≤10 min: 0/1

Index = `(((ready*3 + free)*3 + batt)*4 + block)*2 + soon`.
For PPO, use the continuous version of the same 5 features.

**Reward per decision:** `delivered_units − 0.02 × waiting_units × 5 − 0.5 × battery_%_used`; at day end also
`− 0.5 × items_left_in_mailroom`.

**Tasks (file names as in Issue #2):**
1. Upgrade **`rl_models/robotics_lab_env.py`** (Gymnasium) to this Option 2 state, actions and reward. A simplified mail day is enough:
   - vendor arrival windows (§2)
   - 3 clerks sorting
   - 5-slot robots (25 letters = 1 slot)
   - round trips using the distance table in §2, with a speed factor at class change
   - battery 5% per km (see §8 about 0.8%/min), 2 charging pads at 0.8%/min

   Issue #2 also lists urgent parcels and a 15-min deadline. The model has **no urgent tier for now** (team decision,
   for simplicity), so leave that feature at 0 until we add it.
2. Train **tabular Q-learning** (`train_qlearning.py`, same 288 states → `q_table.npy`) and **PPO** (`train_ppo.py`, real
   Stable-Baselines3 `MlpPolicy` → `ppo_robotics_lab.zip`).
3. **JSON for Illia's Tab 2** (`q_learning_results.json`, `ppo_results.json`). Per `docs/API_CONTRACT.md` §3, **keep the 6
   existing keys** (`algorithm`, `episodes`, `final_avg_reward`, `rewards_sample`, `avg_battery_end`, `avg_backlog_end`) and
   **add** the Option 2 ones, for example:
   ```json
   { "...the 6 existing keys...": "",
     "episode_rewards": [...], "items_left_history": [...], "same_day_pct_history": [...],
     "robot_km_history": [...], "eval": { "same_day_pct": 0, "avg_hours_to_locker": 0, "robot_km": 0 } }
   ```
   Add a `baseline` entry (FIFO heuristic, same seeds) so Tab 2 can draw Baseline vs. Q-learning vs. PPO.
4. To run the policies **inside AnyLogic** (optional but strong for the presentation):
   - export the Q-table as `q_table.csv` (§4.3), which AnyLogic loads with `rlLoadQTable`
   - export the PPO weights as `ppo_policy.json` (layer weights + biases + observation scaling); Ricardo will write the
     forward pass in `ppoAction()` (`dispatchPolicy = 3`) so Compare Runs can show Q-learning vs. PPO in the model.
5. Optional: tune the in-model Q-learning parameters (`rlAlpha`, `rlGamma`, `rlEpsilon*`, reward weights) and run a
   60-day training with `rlLoadQTable` to continue learning.

---

## 6. Illia: Streamlit dashboard

**Important:** the current `dashboard/app.py` is **Option 1** (Stations A–C) and its charts are **generated with
`np.random`** or typed-in numbers. The professor requires real model outputs. Rebuild it on the CSVs in §4.

**The 5 tabs of Issue #3, and the data for each:**
| Tab | Show | Data |
|---|---|---|
| Sidebar | Input sliders: robots, pads, Amazon volume, batching %, cost assumptions (later fed by Ricardo's parameters app, §8) | filter / pick rows from `exp_*.csv` |
| **1 Operational KPIs** | Same-day % (our "SLA"), hours vendor drop → locker, items left in the mailroom, robot km, energy, monthly cost; 30-day trends | `daily_kpis.csv`, `exp_*.csv` |
| **2 AI Policy Comparison** | Training curves + **Baseline vs. Q-learning vs. PPO** bars; also the in-model comparison (policy 0/1/2) | Jordan's `rl_models/*.json` + `exp_compare_runs.csv` |
| **3 AnyLogic Experiments** | Optimization (cost vs. robots, best solution), Monte Carlo (distribution + 95% CI), Sensitivity, Calibration (simulated vs. observed 4 / 7 min) | `exp_optimization.csv`, `exp_monte_carlo.csv`, `exp_sensitivity.csv`, `exp_calibration.csv` |
| **4 3D Digital Twin Status** | Live robots (battery, status, items/slots) with an offline fallback | `GET http://localhost:3000/api/robots` |
| **5 Executive Report** | Insights and recommendations ("What did the model reveal that wasn't obvious?", "Which policies improve the system?") | all of the above |

**Start with** `anylogic_model/exports/` and make the data folder a setting, so the final CSVs drop in.

---

## 7. Jorge: 3D twin

What changed in `digital_twin_app/` (on branch `ricardo`):
- `server.js`: `/api/anylogic/update` also relays `anylogicIds`, `pedestrians`, `clock`, `simTime`; new `/api/anylogic/speed`.
- `public/app.js`: **AnyLogic mode** (robots AnyLogic sends follow it smoothly, the browser dispatcher pauses, green
  banner, back to normal 5 s after AnyLogic stops) + **speed bar** (×1–×20 local, ×10–×600 sent to AnyLogic).
- `public/pedestrians.js`: walking students can be driven by AnyLogic (`setExternalTargets`).

To do / check:
- **Building J (Justice)** was added in AnyLogic at an approximate position (twin x −3.05, z −2.55, linked to
  `lake_rd_north` and `w_lake_junction`). Please confirm it on the 3D map and add it to `pedestrians.js` / `lab_map.js`.
- Building A is **Science** (directory rooms A322/A325), not "Public Safety & Facilities".
- `npm test`: **16 tests were already failing before these changes** (e.g. they expect 5 stations; the app now has 11).
  The snapshots need updating; the AnyLogic changes add no new failures.
- The 3D depot is on the west lawn; the real mailroom (and the AnyLogic depot) is **Building 3**.
- **Issue #4 report & slides:** `docs/Final_Project_Report_MDC.*` and `docs/Presentation_Slides_MDC.*` (and their
  generators) stay in `docs/` for you to finalize, but **their content is still Option 1** (lab stations, numbers that weren't
  produced by model runs). Rewrite them with the Option 2 model and the final experiment CSVs.
- **Issue #1 file path:** the model is `anylogic_model/campus_courier/MDC_Campus_Courier.alp` (a new Option 2 model with
  its own folder, scripts, sample results and README), not `anylogic_model/MDC_Robotics_Lab_Simulation.alp`. The old lab
  model is in `archive/option1_lab/`. If you want the original path, tell Ricardo and we'll move it.

---

## 8. Ricardo: next

- **Issue #1 gaps: done (Nov 23):**
  - optional **urgent tier** (`urgentSharePct`, default 0 = off; `slaUrgentMin = 15`): urgent mail leaves at once and is loaded first; `urgent_on_time_pct` in the CSVs
  - **`Depleted`** robot state (battery empty → stops, towed back after `depletedRescueMinutes`); `depleted_events` in the CSVs
  - battery use **0.8 %/min** while traveling (`batteryUsePctPerKm = 11.1` at 1.2 m/s)
  - **Monte Carlo: 100 runs + 95% confidence intervals**
  - **Sensitivity on battery discharge** (`Sensitivity_BatteryDischarge`, 5 → 20 %/km) next to the Amazon-volume one
  - not added: `MovingToHub`, because trips always start at the mailroom, so there's no separate pickup leg
- **Parameters app** (next step, if time allows): a small form to set the model inputs before a run (robots, pads,
  volumes, costs, policy), saved to a file the model reads at startup.
- Re-run all 5 experiments with the calibrated model and replace the files in `anylogic_model/exports/` with the final CSVs
  (and set the model's `outputFolder` to `../exports` so runs write there directly).
- PPO forward pass in `ppoAction()` once Jordan exports `ppo_policy.json`.
- Report + slides with the final numbers.

See [`RICARDO_README.md`](RICARDO_README.md) for the full list.

---

## 9. Integration checklist before submission
- [ ] Final experiment CSVs from the calibrated model
- [ ] Jordan: Option 2 env + Q-learning vs. PPO results + exported policies
- [ ] PPO running inside AnyLogic (policy 3) and in Compare Runs
- [ ] Illia: dashboard on real CSVs (all required tabs)
- [ ] Live demo: AnyLogic + 3D twin + dashboard
- [ ] Report (2–3 pages), slides, AI use statement, member Module 4 zips
