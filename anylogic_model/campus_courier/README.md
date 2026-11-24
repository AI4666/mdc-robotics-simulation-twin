# MDC Campus Mail Robots — AnyLogic model (Option 2, v2)

The **MDC North Campus mail service** with autonomous courier robots. Vendors drop mail at
the **Duplicating & Mail Center (Building 3, Room 3103)**, 3 clerks sort it, and robots carry it
along the campus walkways to **lockers at each building**. This replaces the Option 1 lab model
(`../MDC_Robotics_Lab_Simulation.alp`).

| File | What it is |
|---|---|
| `MDC_Campus_Courier.alp` | The model. Open it in AnyLogic 8.9 and press **Run**. |
| `build_campus_courier.py` | Scaffold script, already run once. **Don't re-run it** after editing the model in AnyLogic: it overwrites the `.alp`. |
| `alp_xml.py`, `alp_draw.py`, `pml_templates.xml` | Helpers and Process Modeling Library block templates (copied from AnyLogic's bundled example "R - Incoming Message Injects Agents") used by the script. |
| `MDC_Campus_Courier_v1.alp.bak` | The previous version (v1), kept as a backup. |

From now on, change the model with the AnyLogic CLI or in the IDE, for example:

```bash
cli-anything-anylogic project open MDC_Campus_Courier.alp
cli-anything-anylogic var set uspsLettersPerDay 220
cli-anything-anylogic experiment set-param numberOfRovers 2
```

## How it works (multi-method)

| Part | Method | What it does |
|---|---|---|
| Vendor schedule | events | At 07:00 each day: USPS around 10 AM, Amazon 2–3 drops, UPS, FedEx, newspapers early, 0–2 other vendors. A rare late drop (after 4 PM) is sorted the **next day**. |
| Mailroom | **DES flowchart** | `mailArrivals` (Source) → `mailSorting` (Service, `mailClerks` pool = 3 clerks) → `sortedMail` (Sink). Sorting time depends on the item type. |
| Robots | **ABM** | `Rover` agents with a statechart (Idle, Loading, InTransit, Handoff, Returning, WaitingCharger, Charging). They follow the walkway graph, use battery per km and share 2 charging pads. **Capacity: 5 package slots per robot** (`roverCapacityPackages`); letters and newspapers travel in bundles, and **every 25 letters for a building take 1 slot** (`lettersPerSlot`). Lockers are measured in the same slots. |
| Students | **ABM** | `Walker` agents walk between buildings: about 10 normally, 60 at every class change (last 10 minutes of each hour). Robots slow down on crowded walkway segments. |
| Delivery | — | Mail goes to the building's locker; office staff collect it later. If a locker is full, the mail rides back to the mailroom. |
| Dispatching | **RL** | `dispatchPolicy` 0 baseline (send at once, 1 building per trip), 1 batching rule, **2 Q-learning** (learns inside the model, 1 episode = 1 day), 3 PPO hook (`ppoAction()`, for Jordan). |

**Time:** 1 model time unit = 1 second, and the model runs for `workDays` working days (default 30).
Results are reported **per day**.

## Real data used

- Mailroom location: MDC North directory (Duplicating & Mail Center, Room 3103 → Building 3).
- Offices per building (`officeSpec`), from the same directory:
  Bldg 1: 25, Bldg 2: 9, Bldg 3: 2, Bldg 4: 4, Bldg 5: 1, Bldg 6: 1, Bldg 7: 3, Bldg A (Science): 2, Bldg J (Justice): 1, Bldg 8: 0, Bldg 9: 0.
  Mail volume per building is proportional to its number of offices.
- From Ricardo (former MDC Testing Center employee):
  - USPS comes around 10 AM.
  - 3 mailroom staff.
  - Late drops after 4 PM wait for the next day.
  - Building A = Science, Building J = Justice.
- Map: the 3D twin's walkway graph. **Building J was added at an approximate position** (north-west of Building 8); confirm it in the 3D app.
- **Calibration (Calibration_TravelTime, OptQuest, 40 iterations):** observed walk from the Building 3 mailroom to the
  Testing Center (Building 1) = **4 min quiet, 7 min during class change** (Ricardo, former MDC Testing Center employee).
  Best fit: `metersPerTwinUnit = 49.4` (route ≈ 216 m) and `crowdImpactPerWalker = 0.449` → simulated 3.9 min / 7.1 min.
  These calibrated values are now the model defaults.

Values labeled **SYNTHETIC** or **ASSUMPTION** in the parameters are placeholders to replace with real data.

## Outputs (for the dashboard)

Each run writes, into the `output/` folder next to the model:

- `daily_kpis.csv`, one row per day. Columns: arrived, eligible, same_day, same_day_pct, delivered, avg_hours_to_locker, left_in_mailroom,
  max_in_mailroom, late_drops, robot_km, energy_pct, locker_full_events, clerk_util_pct, q_reward, q_epsilon.
- `q_table.csv`: the learned Q-table (policy 2), 288 states × 4 actions. To continue training from it, set `rlLoadQTable = true`.

## 3D twin bridge

Tick `enableTwinBridge` and start the twin (`cd digital_twin_app && npm start`). AnyLogic then POSTs
every robot (`AMR-01…`: x/z in twin units, heading, battery, speed, status, cargo) and every walking student
to `http://localhost:3000/api/anylogic/update`. The 3D app still needs an "AnyLogic mode" before it
follows these positions instead of running its own simulation.

## Known limits of v2

- AnyLogic Personal Learning Edition limits weren't verified (the help site blocked automated access);
  a full 30-day run is the test.
- The 5 course experiments (Optimization, Compare Runs, Monte Carlo, Sensitivity, Calibration) are not added yet.
- PPO is a hook only: `ppoAction()` uses the batching rule until Jordan's trained policy is plugged in.
