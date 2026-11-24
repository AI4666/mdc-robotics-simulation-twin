# 🏗️ AnyLogic Multi-Method Simulation Model (`.alp`)
**Course:** Simulation for Applied AI — Miami Dade College  
**Project Team:**
* **Jorge A Mendoza** — Project Manager & AnyLogic Model Architect
* **Jordan Gonzalez** — Reinforcement Learning Engineer
* **Illia Shybanov** — Dashboard & Integration Specialist
* **Ricardo Molina Gonzalez** — Simulation Experiments & Documentation Lead

---

## 📌 Folder Overview
This directory holds the primary **AnyLogic 8 simulation project file (`.alp`)** and associated 2D/3D assets.

> **⚠️ IMPORTANT — Do Not Overwrite `.alp`:**
> `MDC_Robotics_Lab_Simulation.alp` is edited directly in **AnyLogic 8 IDE** (and optionally via `anylogic-cli` for Issue `#1`).
> Do **not** run `generate_alp.py --force-overwrite` unless you intentionally want to reset the model back to the baseline scaffold—doing so will overwrite IDE edits.
>
> For the exact `POST /api/anylogic/update` JSON payload, valid fleet IDs (`AMR-01`..`AMR-06`, `HUM-01`, `UAV-01`..`UAV-03`), and 3D coordinates, see [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

### File Structure:
* `MDC_Robotics_Lab_Simulation.alp` *(Actively maintained in AnyLogic 8 IDE / `anylogic-cli`)*
* `generate_alp.py` *(Baseline bootstrap script — guarded against accidental overwrites)*
* `assets/robotics_lab_floorplan.png` *(High-resolution scale floorplan of the Miami Dade College lab room)*

---

## 🗺️ Floorplan & Station Coordinates Guide

When importing `assets/robotics_lab_floorplan.png` into AnyLogic's Presentation / Simulation Canvas, set the scale to:
* **Scale:** $1.0\text{ meter} \approx 50\text{ pixels}$ (Room dimensions: $\approx 14.5\text{m} \times 10.2\text{m}$)

### Fixed Laboratory Stations:
| Station | Name | Description | Role in Simulation |
| :--- | :--- | :--- | :--- |
| **Station A** | **Parts Shelf** | Component inventory bins & microcontroller storage | Pickup point for DES student orders |
| **Station B** | **Electronics Bench** | Soldering, wiring & prototyping workbenches | High-traffic delivery target |
| **Station C** | **Testing Table** | Sensor calibration, oscilloscopes, QA testing | Precision delivery target |
| **Station D** | **AMR Charger Dock** | Dual inductive magnetic recharge pads | Recharge zone for depleted AMRs |
| **Station E** | **Drone Helipad** | Aerial surveillance takeoff / landing pad | SkyWatcher UAV zone |

---

## 🔄 AnyLogic Modeling Checklist:
1. **Discrete-Event Process Flow:**
   * `Source` (Poisson student work orders) $\rightarrow$ `Queue` $\rightarrow$ `Seize` AMR $\rightarrow$ `MoveTo` Station A $\rightarrow$ `Delay` (pick component) $\rightarrow$ `MoveTo` Bench B/C $\rightarrow$ `Release` $\rightarrow$ `Sink`.
2. **Agent-Based Modeling (AMR Agent):**
   * States: `Idle`, `InTransit`, `Servicing`, `MovingToDock`, `Charging`.
   * Dynamic variables: `batteryLevel` (0.0 to 1.0), `speed` ($1.2\text{ m/s}$).
3. **3D Animation:**
   * Place 3D Window (`3D Object` $\rightarrow$ `Forklift` / `Transporter` or custom AMR 3D shape).
   * Verify robots visually navigate along paths in 3D during runtime.
