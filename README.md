# MDC North Campus Mail Robots: Multi-Method Digital Twin (Option 2)

[![Course](https://img.shields.io/badge/Course-Simulation_for_Applied_AI-blue)](https://www.mdc.edu)
[![AnyLogic](https://img.shields.io/badge/AnyLogic-8.9-orange)](https://www.anylogic.com)
[![Python](https://img.shields.io/badge/Python-3.10%2B-green)](https://www.python.org)
[![Streamlit](https://img.shields.io/badge/Streamlit-Dashboard-red)](https://streamlit.io)

Group project for **CAI 4830C Simulation for Applied AI**. It's a multi-method simulation (DES + ABM in AnyLogic) with
reinforcement learning (Q-learning vs. PPO), a 3D digital twin and a Streamlit dashboard, for the
**Miami Dade College North Campus mail service**. Autonomous courier robots carry vendor mail
(USPS, Amazon, UPS, FedEx, newspapers…) from the **Duplicating & Mail Center (Building 3, Room 3103)** to
lockers at every building.

> The professor approved **Option 2 (campus courier robots)**. Everything about the old Option 1 (indoor
> Robotics Lab) is in [`archive/option1_lab/`](archive/option1_lab/README.md) for reference only.

**Start here:** [`HANDOFF.md`](HANDOFF.md) (what each team member does next) and
[`RICARDO_README.md`](RICARDO_README.md) (what is finished).

---

## Team

| Member | Role | Main folder |
|---|---|---|
| **Jorge A Mendoza** | Project manager, 3D digital twin | `digital_twin_app/` |
| **Jordan Gonzalez** | Reinforcement learning (Q-learning vs. PPO) | `rl_models/` |
| **Illia Shybanov** | Streamlit dashboard | `dashboard/` |
| **Ricardo Molina Gonzalez** | AnyLogic model, 5 experiments, calibration, AnyLogic ↔ 3D bridge, documentation | `anylogic_model/campus_courier/` |

---

## Repository structure

```text
mdc-robotics-simulation-twin/
├── anylogic_model/campus_courier/     # AnyLogic model (Ricardo)
│   ├── MDC_Campus_Courier.alp         #   the model: DES mailroom + ABM robots and students + Q-learning + 5 experiments
│   ├── README.md                      #   how the model works, real data used, calibration result
│   └── build_campus_courier.py, alp_xml.py, alp_draw.py, pml_templates.xml   # one-time scaffold scripts
├── anylogic_model/exports/            # experiment CSV exports for the dashboard (docs/API_CONTRACT.md §4)
├── digital_twin_app/                  # 3D digital twin, Node.js + Three.js, port 3000 (Jorge; AnyLogic mode by Ricardo)
├── rl_models/                         # RL training (Jordan): still the Option 1 env, to be rebuilt for Option 2
├── dashboard/                         # Streamlit dashboard (Illia): still Option 1 content, to be rebuilt
├── docs/                              # problem statements + Option 2 expanded proposal; final report & slides (to rewrite for Option 2, Issue #4)
├── archive/option1_lab/               # old Option 1 lab model and documents (not used)
├── HANDOFF.md                         # team handoff: tasks, data contracts, how to run everything
└── RICARDO_README.md                  # Ricardo's completed work and future work
```

---

## Quick start

### 1. AnyLogic model
1. Open `anylogic_model/campus_courier/MDC_Campus_Courier.alp` in AnyLogic 8.9 (the Personal Learning Edition works).
2. **Simulation** → Run (30 working days). Or run one of the 5 experiments: `Optimization_FleetSize`,
   `CompareRuns_Policies`, `MonteCarlo_Month`, `Sensitivity_AmazonVolume`, `Calibration_TravelTime`.
3. Results are written to `anylogic_model/campus_courier/output/*.csv`.

### 2. 3D digital twin, live with AnyLogic
```bash
cd digital_twin_app
npm install
npm start          # http://localhost:3000
```
In AnyLogic, tick **enableTwinBridge** in the Simulation experiment and run it. The 3D view shows a green
**"AnyLogic LIVE"** banner, the robots and students follow the model, and the **⏩ speed bar** (bottom right) changes AnyLogic's run speed.

### 3. RL training and dashboard
See [`HANDOFF.md`](HANDOFF.md). Both are being rebuilt for Option 2.

---

## Course requirements and where they are covered

| Requirement | Where |
|---|---|
| Multi-method DES + ABM in AnyLogic | Mailroom flowchart (Source → Service with 3 clerks → Sink) + `Rover` and `Walker` agents |
| 5 experiments | Optimization, Compare Runs, Monte Carlo, Sensitivity, Calibration (all in the `.alp`, with charts) |
| RL: Q-learning vs. PPO | Q-learning inside the model (`dispatchPolicy = 2`); PPO: Jordan (`dispatchPolicy = 3` hook) |
| 3D animation | `digital_twin_app/` following AnyLogic live |
| Streamlit dashboard | `dashboard/` (Illia) reading the CSV outputs |

## Submission checklist
* [x] Evidence of work started submitted.
* [ ] Evidence of work finished + peer grading forms.
* [ ] Individual Module 4 Lesson 1 (Stages 1–3) zips from each member.
* [ ] Final Canvas zip: `.alp` model, slides, 2–3 page report, dashboard + RL training files, member zips, AI use statement.
