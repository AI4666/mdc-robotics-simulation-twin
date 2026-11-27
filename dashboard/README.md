# Streamlit dashboard (Issue #3)

Owner: Illia Shybanov. Option 2, MDC North Campus mail robots.

```bash
cd dashboard
pip install -r requirements.txt
streamlit run app.py          # http://localhost:8501
python -m pytest tests -q     # 23 tests
```

## What it reads (read-only, nothing is written back)

| Source | Owner | Path | Used in |
|---|---|---|---|
| AnyLogic experiment exports | Ricardo | `anylogic_model/exports/*.csv` (HANDOFF.md §4) | Tabs 1, 2, 3, 5 |
| RL results | Jordan | `rl_models/ppo_results.json`, `q_learning_results.json`, `q_table.csv` (API_CONTRACT.md §3) | Tabs 2, 5 |
| 3D twin live telemetry | Jorge | `GET http://localhost:3000/api/robots` (API_CONTRACT.md §2) | Tab 4 |

The data folders can be changed in the sidebar (**Data sources**) or with environment variables:
`DASHBOARD_DATA_DIR`, `DASHBOARD_RL_DIR`, `DASHBOARD_TWIN_URL`. If `anylogic_model/campus_courier/output/`
exists locally (a fresh AnyLogic run), it shows up as a choice in the sidebar.

**Final CSVs:** when the calibrated re-runs replace the files in `anylogic_model/exports/` (21 columns, plus
`exp_sensitivity_battery.csv`), press **Reload data**. No code change is needed; the sidebar status turns green.
Any missing file shows a short "isn't available yet" note instead of an error.

## Tabs

1. **Operational KPIs**: the closest real AnyLogic run to the sidebar settings (robots, pads, batch fill, Amazon
   volume λ): average wait, throughput, SLA violations, battery per robot-day, monthly cost, robot km. Below it, a
   clearly labelled **what-if estimate** (regression on the real runs) for exact settings between runs, the
   fleet-size and λ trade-off charts, and the day-by-day trend from `daily_kpis.csv`.
2. **AI Policy Comparison**: Baseline FIFO vs. Batching vs. Q-learning vs. PPO (reward, battery, km, SLA),
   learning curves, Q-learning SLA violations during training, the in-model Compare Runs (policies 0/1/2, and 3
   when PPO runs inside AnyLogic), and what the Q-table learned.
3. **AnyLogic Experiments**: Optimization (Pareto front, best solution, robots × batch heatmap), Monte Carlo
   (distribution, 95% CI, convergence), Sensitivity (Amazon volume and battery discharge, with heatmap),
   Calibration (simulated vs. observed 4 / 7 min walk), Compare Runs (policy profile).
4. **3D Digital Twin**: live robot cards, positions and battery from `/api/robots`, optional 2 s auto-refresh,
   offline notice when the server isn't running.
5. **Executive Report**: findings computed from the loaded data, recommendations, architecture diagram and a
   data-provenance table.

## Cost assumptions

`monthly_cost` in the CSVs uses $35 per robot-day, $5 per late item and $0.25 per item-hour waiting. The sidebar
re-prices every run with other values by adjusting only those components; the model's energy cost is kept.

## Files

- `app.py`: the Streamlit UI
- `data.py`: loading, KPIs, what-if estimator, statistics, RL comparison, twin client, insights
- `tests/test_dashboard.py`: data-layer tests plus full app runs (committed data, no data, partial data,
  final 21-column data, several policies, twin online / offline)
- `.streamlit/config.toml`: port 8501 and the light MDC-blue theme
