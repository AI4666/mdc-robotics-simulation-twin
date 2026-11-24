# AnyLogic model

The project model is in **[`campus_courier/`](campus_courier/README.md)** → `MDC_Campus_Courier.alp`
(Option 2: MDC North Campus mail service with autonomous courier robots).
Experiment CSV exports for the dashboard: **[`exports/`](exports/)**.

> **Don't overwrite the `.alp`:** it's edited in the AnyLogic 8 IDE (and with `anylogic-cli`). Save and close it in
> AnyLogic before editing the file, and don't re-run `campus_courier/build_campus_courier.py` (a one-time scaffold).
>
> For the `POST /api/anylogic/update` JSON payload, valid fleet IDs (`AMR-01`..`AMR-06`, `HUM-01`, `UAV-01`..`UAV-03`)
> and 3D coordinates, see [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md).

The old Option 1 lab model (`MDC_Robotics_Lab_Simulation.alp`, with Jorge's guarded `generate_alp.py`) was moved to
[`../archive/option1_lab/anylogic_model/`](../archive/option1_lab/README.md).
