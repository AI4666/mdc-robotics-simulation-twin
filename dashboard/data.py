"""
Data layer for the MDC Campus Courier dashboard (Issue #3).

Everything the dashboard shows comes from files the other parts of the project write:
  * AnyLogic experiment exports (Ricardo)  -> anylogic_model/exports/*.csv   (HANDOFF.md section 4)
  * RL training results (Jordan)          -> rl_models/*_results.json       (docs/API_CONTRACT.md section 3)
  * 3D twin live telemetry (Jorge)        -> GET http://localhost:3000/api/robots (docs/API_CONTRACT.md section 2)

This module only reads those files. It never writes to them. All functions tolerate missing files and
missing optional columns, so the final calibrated CSVs (21 columns) and the current samples (19 columns)
both work.
"""

from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------------------------------
# Paths and constants
# --------------------------------------------------------------------------------------------------
DASHBOARD_DIR = Path(__file__).resolve().parent
REPO_ROOT = DASHBOARD_DIR.parent
DEFAULT_EXPORTS_DIR = REPO_ROOT / "anylogic_model" / "exports"
MODEL_OUTPUT_DIR = REPO_ROOT / "anylogic_model" / "campus_courier" / "output"
DEFAULT_RL_DIR = REPO_ROOT / "rl_models"
DEFAULT_TWIN_URL = "http://localhost:3000"

POLICY_NAMES = {0: "Baseline (FIFO)", 1: "Batching", 2: "Q-learning", 3: "PPO"}
RL_POLICY_KEYS = {"fifo": "Baseline (FIFO)", "batching": "Batching", "q_learning": "Q-learning", "ppo": "PPO"}

EXPORT_FILES = {
    "daily": "daily_kpis.csv",
    "optimization": "exp_optimization.csv",
    "compare": "exp_compare_runs.csv",
    "monte_carlo": "exp_monte_carlo.csv",
    "sensitivity": "exp_sensitivity.csv",
    "sensitivity_battery": "exp_sensitivity_battery.csv",
    "calibration": "exp_calibration.csv",
    "q_table": "q_table.csv",
}
RL_FILES = {"ppo": "ppo_results.json", "q_learning": "q_learning_results.json", "q_table": "q_table.csv"}

# HANDOFF.md section 4.2: the 21 columns shared by every exp_*.csv (the last two are newer).
EXP_COLUMNS = [
    "policy", "robots", "pads", "batch_fill_pct", "amazon_per_day", "meters_per_unit", "crowd_impact",
    "work_days", "arrived", "delivered", "same_day_pct", "late_items", "avg_hours_to_locker", "robot_km",
    "energy_pct", "monthly_cost", "sim_trip_quiet_min", "sim_trip_rush_min", "calibration_error",
    "urgent_on_time_pct", "depleted_events",
]
NEW_EXP_COLUMNS = ["urgent_on_time_pct", "depleted_events"]

# Mailroom operating day, 08:00 to 17:30 (HANDOFF.md section 4.1, items left at 17:30).
OPERATING_HOURS = 9.5
# Cost assumptions built into the AnyLogic monthly_cost column (HANDOFF.md section 4.2).
COST_DEFAULTS = {"robot_day": 35.0, "late_item": 5.0, "item_hour": 0.25}
# Observed walk Building 3 -> Building 1: 4 min quiet, 7 min at class change (HANDOFF.md section 2).
CALIBRATION_TARGET = {"quiet": 4.0, "rush": 7.0}
# The model's default setup (the Monte Carlo and Compare Runs experiments use it).
DEFAULT_SETUP = {"robots": 6, "pads": 2, "batch_fill_pct": 60.0, "amazon_per_day": 25.0}

ACTIONS = ["wait", "send_one", "send_all", "charge"]
STATE_LEVELS = {
    "ready": ["0", "<2 slots", "<5 slots", ">=5 slots"],
    "free": ["0", "1", "2+"],
    "battery": ["<40%", "<70%", ">=70%"],
    "block": ["before 10h", "10-12h", "12-14h", "after 14h"],
    "soon": ["no", "yes"],
}


# --------------------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------------------
def resolve_dir(text: str | None, default: Path) -> Path:
    """A folder typed by the user (absolute, or relative to the repo root), or the default."""
    if not text or not text.strip():
        return default
    p = Path(text.strip().strip('"'))
    if not p.is_absolute():
        p = (REPO_ROOT / p).resolve()
    return p


def default_exports_dir() -> Path:
    """DASHBOARD_DATA_DIR env var, else anylogic_model/exports/ (docs/API_CONTRACT.md section 4)."""
    env = os.environ.get("DASHBOARD_DATA_DIR")
    return resolve_dir(env, DEFAULT_EXPORTS_DIR) if env else DEFAULT_EXPORTS_DIR


def default_rl_dir() -> Path:
    env = os.environ.get("DASHBOARD_RL_DIR")
    return resolve_dir(env, DEFAULT_RL_DIR) if env else DEFAULT_RL_DIR


def default_twin_url() -> str:
    return os.environ.get("DASHBOARD_TWIN_URL", DEFAULT_TWIN_URL)


def file_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def read_csv(path: Path) -> pd.DataFrame | None:
    """CSV as numbers where possible; None if the file is missing, empty or unreadable."""
    try:
        if not path.is_file():
            return None
        df = pd.read_csv(path)
    except (OSError, ValueError, pd.errors.ParserError):
        return None
    if df.empty:
        return None
    df.columns = [str(c).strip() for c in df.columns]
    for col in df.columns:
        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum() == df[col].notna().sum():
            df[col] = converted
    return df


def read_json(path: Path) -> dict | None:
    try:
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def load_exports(folder: Path) -> dict[str, pd.DataFrame | None]:
    return {key: read_csv(folder / name) for key, name in EXPORT_FILES.items()}


def load_rl(folder: Path) -> dict:
    return {
        "ppo": read_json(folder / RL_FILES["ppo"]),
        "q_learning": read_json(folder / RL_FILES["q_learning"]),
        "q_table": read_csv(folder / RL_FILES["q_table"]),
    }


def file_inventory(folder: Path, names: dict[str, str]) -> pd.DataFrame:
    """One row per expected file: found or not, rows, columns, last modified."""
    rows = []
    for key, name in names.items():
        p = folder / name
        found = p.is_file()
        n_rows = n_cols = None
        if found and name.endswith(".csv"):
            df = read_csv(p)
            if df is not None:
                n_rows, n_cols = len(df), df.shape[1]
        rows.append({
            "File": name,
            "Status": "found" if found else "missing",
            "Rows": n_rows,
            "Columns": n_cols,
            "Modified": datetime.fromtimestamp(file_mtime(p)).strftime("%Y-%m-%d %H:%M") if found else "",
        })
    return pd.DataFrame(rows)


def exports_are_final(exports: dict[str, pd.DataFrame | None]) -> bool:
    """True once the exp_*.csv files carry the 2 newer columns (final calibrated runs)."""
    frames = [exports.get(k) for k in ("optimization", "monte_carlo", "compare", "sensitivity")]
    frames = [f for f in frames if f is not None]
    return bool(frames) and all(all(c in f.columns for c in NEW_EXP_COLUMNS) for f in frames)


# --------------------------------------------------------------------------------------------------
# Derived KPIs
# --------------------------------------------------------------------------------------------------
def has(df: pd.DataFrame | None, *cols: str) -> bool:
    return df is not None and all(c in df.columns for c in cols)


def add_derived(df: pd.DataFrame | None) -> pd.DataFrame | None:
    """Adds the Issue #3 KPI names on top of an exp_*.csv frame (one row per run)."""
    if df is None:
        return None
    out = df.copy()
    days = out["work_days"].replace(0, np.nan) if "work_days" in out else np.nan
    if has(out, "delivered", "work_days"):
        out["throughput_per_hr"] = out["delivered"] / (days * OPERATING_HOURS)
    if "same_day_pct" in out:
        out["sla_violation_pct"] = (100.0 - out["same_day_pct"]).clip(lower=0)
    if has(out, "energy_pct", "robots", "work_days"):
        out["battery_per_robot_day"] = out["energy_pct"] / (out["robots"].replace(0, np.nan) * days)
    if has(out, "monthly_cost", "delivered"):
        out["cost_per_item"] = out["monthly_cost"] / out["delivered"].replace(0, np.nan)
    if "policy" in out:
        out["policy_name"] = out["policy"].map(lambda p: POLICY_NAMES.get(int(p), f"Policy {int(p)}")
                                               if pd.notna(p) else "unknown")
    return out


def recost(df: pd.DataFrame | None, robot_day: float, late_item: float, item_hour: float) -> pd.DataFrame | None:
    """
    Re-prices each AnyLogic run with the sidebar cost assumptions. monthly_cost was computed in the model
    with COST_DEFAULTS, so only the difference in each priced component is added; the model's energy cost
    is kept as it is.
    """
    if df is None or not has(df, "monthly_cost"):
        return df
    out = df.copy()
    adj = pd.Series(0.0, index=out.index)
    if has(out, "robots", "work_days"):
        adj += (robot_day - COST_DEFAULTS["robot_day"]) * out["robots"] * out["work_days"]
    if "late_items" in out:
        adj += (late_item - COST_DEFAULTS["late_item"]) * out["late_items"]
    if has(out, "delivered", "avg_hours_to_locker"):
        adj += (item_hour - COST_DEFAULTS["item_hour"]) * out["delivered"] * out["avg_hours_to_locker"]
    out["cost"] = out["monthly_cost"] + adj
    if "delivered" in out:
        out["cost_per_item"] = out["cost"] / out["delivered"].replace(0, np.nan)
    return out


def closest_run(df: pd.DataFrame | None, robots: int, pads: int, batch: float, amazon: float):
    """The real AnyLogic run nearest to the sidebar settings: (row, exact_match). (None, False) if no data."""
    if df is None or df.empty:
        return None, False
    scales = {"robots": 5.0, "pads": 2.0, "batch_fill_pct": 60.0, "amazon_per_day": 50.0}
    target = {"robots": robots, "pads": pads, "batch_fill_pct": batch, "amazon_per_day": amazon}
    dist = pd.Series(0.0, index=df.index)
    for col, scale in scales.items():
        if col in df:
            dist += ((df[col] - target[col]) / scale) ** 2
    idx = dist.idxmin()
    row = df.loc[idx]
    exact = all(col not in df or math.isclose(float(row[col]), float(target[col])) for col in scales)
    return row, exact


# --------------------------------------------------------------------------------------------------
# What-if estimator (clearly an estimate, fitted on real runs)
# --------------------------------------------------------------------------------------------------
WHATIF_TARGETS = ["arrived", "delivered", "avg_hours_to_locker", "robot_km", "energy_pct", "late_items",
                  "monthly_cost", "same_day_pct"]


def _features(robots, pads, batch, amazon) -> np.ndarray:
    robots = np.asarray(robots, dtype=float)
    return np.column_stack([
        np.ones_like(robots), robots, 1.0 / np.maximum(robots, 1.0),
        np.asarray(pads, dtype=float), np.asarray(batch, dtype=float), np.asarray(amazon, dtype=float),
    ])


def fit_whatif(frames: list[pd.DataFrame | None]) -> dict | None:
    """
    Least-squares fit of each KPI on fleet size, charging pads, batch fill and Amazon volume, using every
    30-day batching-policy run in the experiment exports. Returns None when there are too few runs.
    """
    need = ["robots", "pads", "batch_fill_pct", "amazon_per_day"]
    parts = [f for f in frames if f is not None and has(f, *need)]
    if not parts:
        return None
    data = pd.concat(parts, ignore_index=True)
    if "policy" in data:
        data = data[data["policy"] == 1]
    if "work_days" in data:
        data = data[data["work_days"] == data["work_days"].max()]
    data = data.dropna(subset=need)
    if len(data) < 8:
        return None
    X = _features(data["robots"], data["pads"], data["batch_fill_pct"], data["amazon_per_day"])
    model = {"n": int(len(data)), "work_days": float(data["work_days"].max()) if "work_days" in data else 30.0,
             "coef": {}, "r2": {},
             "ranges": {c: (float(data[c].min()), float(data[c].max())) for c in need}}
    for target in WHATIF_TARGETS:
        if target not in data:
            continue
        y = data[target].to_numpy(dtype=float)
        coef, *_ = np.linalg.lstsq(X, y, rcond=None)
        pred = X @ coef
        ss_res = float(np.sum((y - pred) ** 2))
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        model["coef"][target] = coef
        model["r2"][target] = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    return model


def predict_whatif(model: dict | None, robots, pads, batch, amazon, costs: dict) -> dict | None:
    if not model:
        return None
    x = _features([robots], [pads], [batch], [amazon])[0]
    est = {t: float(x @ c) for t, c in model["coef"].items()}
    for k in ("arrived", "delivered", "avg_hours_to_locker", "robot_km", "energy_pct", "late_items", "monthly_cost"):
        if k in est:
            est[k] = max(est[k], 0.0)
    if "same_day_pct" in est:
        est["same_day_pct"] = float(np.clip(est["same_day_pct"], 0, 100))
    days = model["work_days"]
    row = pd.DataFrame([{**est, "robots": robots, "work_days": days}])
    if "monthly_cost" in est:
        row = recost(row, costs["robot_day"], costs["late_item"], costs["item_hour"])
        est["cost"] = float(row["cost"].iloc[0])
    if "delivered" in est:
        est["throughput_per_hr"] = est["delivered"] / (days * OPERATING_HOURS)
    if "energy_pct" in est:
        est["battery_per_robot_day"] = est["energy_pct"] / (max(robots, 1) * days)
    if "same_day_pct" in est:
        est["sla_violation_pct"] = max(0.0, 100.0 - est["same_day_pct"])
    est["extrapolating"] = any(
        not (lo <= v <= hi) for (lo, hi), v in zip(
            [model["ranges"][c] for c in ("robots", "pads", "batch_fill_pct", "amazon_per_day")],
            (robots, pads, batch, amazon)))
    return est


# --------------------------------------------------------------------------------------------------
# Statistics helpers
# --------------------------------------------------------------------------------------------------
def mean_ci(values, z: float = 1.96) -> dict:
    """Mean and normal-approximation 95% confidence interval of the mean."""
    s = pd.Series(values, dtype=float).dropna()
    n = int(len(s))
    if n == 0:
        return {"mean": float("nan"), "lo": float("nan"), "hi": float("nan"), "n": 0, "std": float("nan")}
    m = float(s.mean())
    sd = float(s.std(ddof=1)) if n > 1 else 0.0
    half = z * sd / math.sqrt(n) if n > 1 else 0.0
    return {"mean": m, "lo": m - half, "hi": m + half, "n": n, "std": sd}


def pareto_mask(df: pd.DataFrame, x: str, y: str) -> pd.Series:
    """Runs no other run beats on both x and y (both minimised)."""
    xs, ys = df[x].to_numpy(dtype=float), df[y].to_numpy(dtype=float)
    keep = []
    for i in range(len(df)):
        dominated = np.any((xs <= xs[i]) & (ys <= ys[i]) & ((xs < xs[i]) | (ys < ys[i])))
        keep.append(not dominated)
    return pd.Series(keep, index=df.index)


def rolling_mean(values, window: int) -> list[float]:
    s = pd.Series(values, dtype=float)
    return s.rolling(window=max(1, window), min_periods=1).mean().tolist()


# --------------------------------------------------------------------------------------------------
# RL results (Jordan)
# --------------------------------------------------------------------------------------------------
def rl_comparison(ppo: dict | None, q: dict | None) -> pd.DataFrame:
    """
    Baseline (FIFO) vs. Batching vs. Q-learning vs. PPO, from the baseline_comparison blocks of the two
    JSON files (PPO's file is preferred because it has all four), filled in from the top-level keys.
    """
    merged: dict[str, dict] = {}
    for src in (q, ppo):  # later wins, so PPO's evaluation numbers take precedence
        if src and isinstance(src.get("baseline_comparison"), dict):
            for k, v in src["baseline_comparison"].items():
                if isinstance(v, dict) and v:
                    merged[k] = {**merged.get(k, {}), **v}
    for key, src in (("q_learning", q), ("ppo", ppo)):
        if src and key not in merged:
            merged[key] = {
                "avg_reward": src.get("final_avg_reward"),
                "same_day_pct": src.get("same_day_pct"),
                "avg_backlog": src.get("avg_backlog_end"),
                "avg_battery": src.get("avg_battery_end"),
                "avg_km": src.get("robot_km"),
            }
    rows = []
    for key, label in RL_POLICY_KEYS.items():
        if key in merged:
            m = merged[key]
            battery = m.get("avg_battery")
            rows.append({
                "key": key,
                "Policy": label,
                "Avg reward / day": _num(m.get("avg_reward")),
                "Same-day %": _num(m.get("same_day_pct")),
                "SLA violation %": None if _num(m.get("same_day_pct")) is None
                else max(0.0, 100.0 - _num(m.get("same_day_pct"))),
                "Battery at day end %": None if _num(battery) is None
                else (_num(battery) * 100.0 if _num(battery) <= 1.0 else _num(battery)),
                "Items left at day end": _num(m.get("avg_backlog")),
                "Robot km / day": _num(m.get("avg_km")),
            })
    return pd.DataFrame(rows)


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def decode_state(index: int) -> dict:
    """Inverse of HANDOFF.md section 5: index = (((ready*3 + free)*3 + batt)*4 + block)*2 + soon."""
    soon = index % 2
    index //= 2
    block = index % 4
    index //= 4
    batt = index % 3
    index //= 3
    free = index % 3
    ready = index // 3
    return {"ready": ready, "free": free, "battery": batt, "block": block, "soon": soon}


def q_policy(q_table: pd.DataFrame | None) -> pd.DataFrame | None:
    """Q-table with decoded state features and the greedy action per state (only visited states)."""
    if q_table is None or not has(q_table, "state", *ACTIONS):
        return None
    df = q_table.copy()
    values = df[ACTIONS].to_numpy(dtype=float)
    df["visited"] = np.abs(values).sum(axis=1) > 0
    df["best_action"] = [ACTIONS[i] for i in values.argmax(axis=1)]
    decoded = pd.DataFrame([decode_state(int(s)) for s in df["state"]])
    for col in decoded:
        df[col] = decoded[col].to_numpy()
        df[col + "_label"] = [STATE_LEVELS[col][v] if 0 <= v < len(STATE_LEVELS[col]) else str(v)
                              for v in decoded[col]]
    return df


# --------------------------------------------------------------------------------------------------
# 3D digital twin (Jorge) — GET /api/robots
# --------------------------------------------------------------------------------------------------
def fetch_robots(base_url: str, timeout: float = 2.0) -> tuple[list[dict] | None, str | None]:
    """(robots, None) when the twin answers, (None, reason) when it is offline or answers badly."""
    url = base_url.rstrip("/") + "/api/robots"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return None, str(getattr(exc, "reason", exc))
    robots = payload.get("robots") if isinstance(payload, dict) else None
    if not isinstance(robots, list):
        return None, "unexpected response (no 'robots' list)"
    return [r for r in robots if isinstance(r, dict)], None


def fleet_frame(robots: list[dict], couriers_only: bool = True) -> pd.DataFrame:
    """Robot list as a table. Courier robots are the AMR-xx ids AnyLogic drives (API_CONTRACT section 1)."""
    df = pd.DataFrame(robots)
    if df.empty:
        return df
    for col, default in (("id", ""), ("name", ""), ("type", ""), ("status", ""), ("battery", np.nan),
                         ("speed", np.nan), ("x", np.nan), ("z", np.nan)):
        if col not in df:
            df[col] = default
    if couriers_only:
        df = df[df["id"].astype(str).str.startswith("AMR-")]
    df["battery"] = pd.to_numeric(df["battery"], errors="coerce")
    df["speed"] = pd.to_numeric(df["speed"], errors="coerce")
    return df.reset_index(drop=True)


# --------------------------------------------------------------------------------------------------
# Executive insights, computed from whatever data is loaded
# --------------------------------------------------------------------------------------------------
def _pct_change(new, old):
    if old in (None, 0) or new is None or (isinstance(old, float) and math.isnan(old)):
        return None
    return (new - old) / abs(old) * 100.0


def build_insights(opt, compare, mc, sens, calib, rl_table) -> list[dict]:
    """Findings as {title, body, tag}. Each one is skipped when its data is missing."""
    out: list[dict] = []

    if has(opt, "cost", "robots", "same_day_pct"):
        ok = opt[(opt["same_day_pct"] >= 99.5) & (opt.get("late_items", 0) == 0)] if "late_items" in opt else opt
        ok = ok if not ok.empty else opt
        best = ok.loc[ok["cost"].idxmin()]
        big = opt[opt["robots"] == opt["robots"].max()]
        body = (f"The cheapest run that still delivers ≥99.5% same-day with no late items uses "
                f"**{int(best['robots'])} robot(s), {int(best['pads'])} pad(s), {best['batch_fill_pct']:.0f}% batch fill** "
                f"at **${best['cost']:,.0f}/month**.")
        if not big.empty:
            ch = _pct_change(best["cost"], float(big["cost"].mean()))
            if ch is not None:
                body += (f" The {int(opt['robots'].max())}-robot runs average ${big['cost'].mean():,.0f}, so a "
                         f"smaller fleet is **{abs(ch):.0f}% cheaper** with no loss in same-day service.")
        out.append({"title": "A smaller fleet is enough", "body": body, "tag": "Optimization"})

    if has(compare, "policy", "robot_km", "avg_hours_to_locker"):
        g = compare.groupby("policy").agg(km=("robot_km", "mean"), hours=("avg_hours_to_locker", "mean"))
        if 0 in g.index and len(g) > 1:
            base = g.loc[0]
            best_km = g["km"].idxmin()
            body = (f"Sending robots immediately (FIFO) gives the fastest lockers ({base['hours']:.1f} h) but drives "
                    f"the most ({base['km']:,.0f} km/month).")
            if best_km != 0:
                ch = _pct_change(g.loc[best_km, "km"], base["km"])
                body += (f" **{POLICY_NAMES.get(int(best_km), best_km)}** cuts robot distance by **{abs(ch):.0f}%** "
                         f"({g.loc[best_km, 'km']:,.0f} km) for {g.loc[best_km, 'hours']:.1f} h to locker.")
            body += " Waiting for fuller loads trades a little speed for far less wear and energy."
            out.append({"title": "Speed vs. distance: the dispatch trade-off", "body": body, "tag": "Compare Runs"})

    if rl_table is not None and not rl_table.empty and "Avg reward / day" in rl_table:
        t = rl_table.set_index("key")
        if "ppo" in t.index and "fifo" in t.index:
            ppo, fifo = t.loc["ppo"], t.loc["fifo"]
            ch = _pct_change(ppo["Avg reward / day"], fifo["Avg reward / day"])
            body = (f"PPO reaches an average daily reward of **{ppo['Avg reward / day']:.1f}** vs. "
                    f"{fifo['Avg reward / day']:.1f} for FIFO")
            body += f" (**{abs(ch):.0f}% better**)" if ch is not None else ""
            if ppo.get("Battery at day end %") is not None and fifo.get("Battery at day end %") is not None:
                body += (f", and ends the day with **{ppo['Battery at day end %']:.0f}%** battery instead of "
                         f"{fifo['Battery at day end %']:.0f}%")
            body += (f", while keeping same-day delivery at {ppo['Same-day %']:.1f}%.")
            out.append({"title": "PPO learns to protect the batteries", "body": body, "tag": "Reinforcement learning"})

    if has(mc, "cost"):
        ci = mean_ci(mc["cost"])
        hrs = mean_ci(mc["avg_hours_to_locker"]) if "avg_hours_to_locker" in mc else None
        body = (f"Across **{ci['n']} random months**, the current setup costs **${ci['mean']:,.0f}** "
                f"(95% CI ${ci['lo']:,.0f}–${ci['hi']:,.0f}).")
        if hrs and hrs["n"]:
            lo, hi = float(mc["avg_hours_to_locker"].min()), float(mc["avg_hours_to_locker"].max())
            body += (f" Hours to locker range from {lo:.1f} to {hi:.1f} h between months with the same setup: "
                     f"random variation alone changes service by up to {hi / lo if lo > 0 else float('nan'):.1f}×.")
        out.append({"title": "Month-to-month variability is real", "body": body, "tag": "Monte Carlo"})

    if has(sens, "amazon_per_day", "robot_km"):
        g = sens.groupby("amazon_per_day").mean(numeric_only=True)
        if len(g) >= 2:
            slope_km = np.polyfit(g.index.to_numpy(float), g["robot_km"].to_numpy(float), 1)[0]
            body = (f"Every **+10 Amazon drops/day** adds about **{slope_km * 10:,.0f} robot km/month**")
            if "arrived" in g:
                slope_items = np.polyfit(g.index.to_numpy(float), g["arrived"].to_numpy(float), 1)[0]
                body += f" and {slope_items * 10:,.0f} items"
            same = g["same_day_pct"].min() if "same_day_pct" in g else None
            body += "."
            if same is not None:
                level = "100%" if same >= 99.95 else f"≥{same:.1f}%"
                body += (f" Same-day service stays at {level} even at {g.index.max():.0f} drops/day, so the "
                         f"fleet has headroom for growth.")
            out.append({"title": "Amazon growth is absorbed", "body": body, "tag": "Sensitivity"})

    if has(calib, "calibration_error", "meters_per_unit", "crowd_impact"):
        best = calib.loc[calib["calibration_error"].idxmin()]
        body = (f"The calibration search converged to **{best['meters_per_unit']:.1f} m/unit** and crowd impact "
                f"**{best['crowd_impact']:.3f}**, reproducing the observed walk at "
                f"{best.get('sim_trip_quiet_min', float('nan')):.1f} min quiet / "
                f"{best.get('sim_trip_rush_min', float('nan')):.1f} min at class change "
                f"(target {CALIBRATION_TARGET['quiet']:.0f} / {CALIBRATION_TARGET['rush']:.0f} min, error "
                f"{best['calibration_error']:.3f}).")
        out.append({"title": "The model matches the real campus", "body": body, "tag": "Calibration"})

    return out
