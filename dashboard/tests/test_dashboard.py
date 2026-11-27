"""
Tests for the Streamlit dashboard (Issue #3).

    cd dashboard
    python -m pytest tests -q

They only read the committed data (anylogic_model/exports, rl_models) and write temporary copies; no team
file is modified. A tiny local HTTP server stands in for the 3D twin's GET /api/robots.
"""

from __future__ import annotations

import json
import shutil
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pandas as pd
import pytest
from streamlit.testing.v1 import AppTest

DASH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DASH))
import data as D  # noqa: E402

APP = str(DASH / "app.py")
TIMEOUT = 120


# ----------------------------------------------------------------------------------------------- helpers
def run_app(monkeypatch, exports=None, rl=None, twin="http://127.0.0.1:9", setup=None) -> AppTest:
    if exports is not None:
        monkeypatch.setenv("DASHBOARD_DATA_DIR", str(exports))
    if rl is not None:
        monkeypatch.setenv("DASHBOARD_RL_DIR", str(rl))
    monkeypatch.setenv("DASHBOARD_TWIN_URL", twin)
    at = AppTest.from_file(APP, default_timeout=TIMEOUT)
    at.run()
    if setup:
        setup(at)
        at.run()
    return at


def assert_clean(at: AppTest) -> None:
    assert not at.exception, [e.value for e in at.exception]
    assert not at.error, [e.value for e in at.error]


class FakeTwin(BaseHTTPRequestHandler):
    robots = [
        {"id": "AMR-01", "name": "Courier 1", "type": "amr", "x": -1.5, "y": 0.05, "z": -1.35, "heading": 0.0,
         "status": "Delivering to Building 1", "battery": 82, "speed": 1.2, "cargo": 3, "slots": 5},
        {"id": "AMR-02", "name": "Courier 2", "type": "amr", "x": 0.4, "y": 0.05, "z": 1.1, "heading": 1.57,
         "status": "Charging", "battery": 21, "speed": 0.0, "cargo": 0, "slots": 5},
        {"id": "UAV-01", "name": "Drone", "type": "drone", "x": 0, "y": 1.9, "z": 0, "status": "In flight",
         "battery": 88, "speed": 1.1},
    ]

    def do_GET(self):  # noqa: N802
        body = json.dumps({"robots": self.robots}).encode()
        self.send_response(200 if self.path == "/api/robots" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture()
def twin_server():
    srv = HTTPServer(("127.0.0.1", 0), FakeTwin)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


# ----------------------------------------------------------------------------------------------- data layer
def test_committed_files_load():
    ex = D.load_exports(D.DEFAULT_EXPORTS_DIR)
    for key in ("daily", "optimization", "compare", "monte_carlo", "sensitivity", "calibration"):
        assert ex[key] is not None and len(ex[key]) > 0, key
    rl = D.load_rl(D.DEFAULT_RL_DIR)
    assert rl["ppo"] and rl["q_learning"]
    for key in ("algorithm", "episodes", "final_avg_reward", "rewards_sample", "avg_battery_end", "avg_backlog_end"):
        assert key in rl["ppo"] and key in rl["q_learning"], key  # API_CONTRACT section 3


def test_state_decoding_matches_handoff_formula():
    seen = set()
    for ready in range(4):
        for free in range(3):
            for batt in range(3):
                for block in range(4):
                    for soon in range(2):
                        idx = (((ready * 3 + free) * 3 + batt) * 4 + block) * 2 + soon
                        assert D.decode_state(idx) == {"ready": ready, "free": free, "battery": batt,
                                                       "block": block, "soon": soon}
                        seen.add(idx)
    assert seen == set(range(288))


def test_recost_is_identity_at_model_defaults_and_linear_otherwise():
    opt = D.add_derived(D.read_csv(D.DEFAULT_EXPORTS_DIR / "exp_optimization.csv"))
    same = D.recost(opt, **D.COST_DEFAULTS)
    assert (same["cost"] - same["monthly_cost"]).abs().max() < 1e-9
    dearer = D.recost(opt, robot_day=45.0, late_item=5.0, item_hour=0.25)
    expected = opt["monthly_cost"] + 10.0 * opt["robots"] * opt["work_days"]
    assert (dearer["cost"] - expected).abs().max() < 1e-6


def test_derived_kpis():
    opt = D.add_derived(D.read_csv(D.DEFAULT_EXPORTS_DIR / "exp_optimization.csv"))
    r = opt.iloc[0]
    assert r["throughput_per_hr"] == pytest.approx(r["delivered"] / (r["work_days"] * D.OPERATING_HOURS))
    assert r["sla_violation_pct"] == pytest.approx(100 - r["same_day_pct"])
    assert r["battery_per_robot_day"] == pytest.approx(r["energy_pct"] / (r["robots"] * r["work_days"]))


def test_closest_run_exact_and_nearest():
    opt = D.read_csv(D.DEFAULT_EXPORTS_DIR / "exp_optimization.csv")
    row, exact = D.closest_run(opt, 3, 2, 60, 25)
    assert exact and int(row["robots"]) == 3 and int(row["pads"]) == 2
    row, exact = D.closest_run(opt, 4, 1, 40, 25)  # not in the 30 sampled runs
    assert not exact and row is not None
    assert D.closest_run(None, 1, 1, 40, 25) == (None, False)


def test_whatif_fit_and_prediction():
    ex = D.load_exports(D.DEFAULT_EXPORTS_DIR)
    model = D.fit_whatif([ex["optimization"], ex["sensitivity"], ex["monte_carlo"]])
    assert model and model["n"] >= 30
    assert model["r2"]["monthly_cost"] > 0.3
    est = D.predict_whatif(model, 3, 2, 60, 25, D.COST_DEFAULTS)
    assert est["cost"] > 0 and 0 <= est["same_day_pct"] <= 100 and not est["extrapolating"]
    dearer = D.predict_whatif(model, 3, 2, 60, 25, {**D.COST_DEFAULTS, "robot_day": 45.0})
    assert dearer["cost"] == pytest.approx(est["cost"] + 10 * 3 * model["work_days"], rel=1e-6)
    assert D.predict_whatif(model, 6, 2, 60, 200, D.COST_DEFAULTS)["extrapolating"]
    assert D.fit_whatif([None]) is None


def test_mean_ci_and_pareto():
    ci = D.mean_ci([1, 2, 3, 4, 5])
    assert ci["mean"] == 3 and ci["lo"] < 3 < ci["hi"] and ci["n"] == 5
    assert D.mean_ci([])["n"] == 0
    df = pd.DataFrame({"a": [1, 2, 3, 2], "b": [3, 2, 1, 3]})
    assert D.pareto_mask(df, "a", "b").tolist() == [True, True, True, False]


def test_rl_comparison_has_all_four_policies():
    rl = D.load_rl(D.DEFAULT_RL_DIR)
    t = D.rl_comparison(rl["ppo"], rl["q_learning"])
    assert t["Policy"].tolist() == ["Baseline (FIFO)", "Batching", "Q-learning", "PPO"]
    ppo = t.set_index("key").loc["ppo"]
    assert ppo["Avg reward / day"] == pytest.approx(rl["ppo"]["final_avg_reward"])
    assert 0 <= ppo["Battery at day end %"] <= 100
    # Only the six guaranteed keys (API_CONTRACT section 3): still works.
    minimal = {k: rl["ppo"][k] for k in ("algorithm", "episodes", "final_avg_reward", "rewards_sample",
                                         "avg_battery_end", "avg_backlog_end")}
    t2 = D.rl_comparison(minimal, None)
    assert t2["Policy"].tolist() == ["PPO"]
    assert D.rl_comparison(None, None).empty


def test_q_policy_decodes_table():
    qp = D.q_policy(D.read_csv(D.DEFAULT_RL_DIR / "q_table.csv"))
    assert len(qp) == 288 and qp["visited"].any()
    assert set(qp["best_action"]) <= set(D.ACTIONS)


def test_fetch_robots_offline_and_online(twin_server):
    robots, err = D.fetch_robots("http://127.0.0.1:9", timeout=0.5)
    assert robots is None and err
    robots, err = D.fetch_robots(twin_server)
    assert err is None and len(robots) == 3
    df = D.fleet_frame(robots, couriers_only=True)
    assert df["id"].tolist() == ["AMR-01", "AMR-02"]
    assert len(D.fleet_frame(robots, couriers_only=False)) == 3


def test_insights_from_committed_data():
    ex = D.load_exports(D.DEFAULT_EXPORTS_DIR)
    rl = D.load_rl(D.DEFAULT_RL_DIR)
    f = lambda k: D.recost(D.add_derived(ex[k]), **D.COST_DEFAULTS)  # noqa: E731
    ins = D.build_insights(f("optimization"), f("compare"), f("monte_carlo"), f("sensitivity"),
                           D.add_derived(ex["calibration"]), D.rl_comparison(rl["ppo"], rl["q_learning"]))
    assert {i["tag"] for i in ins} == {"Optimization", "Compare Runs", "Reinforcement learning", "Monte Carlo",
                                       "Sensitivity", "Calibration"}
    assert D.build_insights(None, None, None, None, None, pd.DataFrame()) == []


# ----------------------------------------------------------------------------------------------- full app
def test_app_runs_with_committed_data(monkeypatch):
    at = run_app(monkeypatch)
    assert_clean(at)
    assert len(at.tabs) >= 10  # 5 main tabs + 5 experiment tabs
    assert len(at.get("plotly_chart")) >= 20
    assert any("Sample exports" in w.value for w in at.warning)  # 19-column samples are flagged


@pytest.mark.parametrize("robots,pads,amazon", [(1, 1, 10), (2, 3, 60), (6, 2, 25), (4, 1, 45)])
def test_app_sidebar_scenarios(monkeypatch, robots, pads, amazon):
    def setup(at):
        at.slider[0].set_value(robots)
        at.slider[1].set_value(pads)
        at.slider[2].set_value(amazon)
    at = run_app(monkeypatch, setup=setup)
    assert_clean(at)


def test_app_cost_assumptions_and_options(monkeypatch):
    def setup(at):
        at.number_input[0].set_value(60.0)
        at.number_input[2].set_value(1.0)
        at.radio(key="mc_metric").set_value("avg_hours_to_locker")
        at.slider(key="rl_window").set_value(1)
    at = run_app(monkeypatch, setup=setup)
    assert_clean(at)


def test_app_with_no_data_at_all(monkeypatch, tmp_path):
    at = run_app(monkeypatch, exports=tmp_path / "none", rl=tmp_path / "none")
    assert not at.exception, [e.value for e in at.exception]
    assert [e.value for e in at.error] == [f"No AnyLogic CSVs found in `{tmp_path / 'none'}`."]  # sidebar status
    assert len(at.info) >= 5  # friendly "isn't available yet" notes instead of crashes


def test_app_with_only_some_files(monkeypatch, tmp_path):
    shutil.copy(D.DEFAULT_EXPORTS_DIR / "exp_optimization.csv", tmp_path)
    shutil.copy(D.DEFAULT_RL_DIR / "q_learning_results.json", tmp_path)
    at = run_app(monkeypatch, exports=tmp_path, rl=tmp_path)
    assert_clean(at)


def test_app_with_final_21_column_exports(monkeypatch, tmp_path):
    """Ricardo's final CSVs add urgent_on_time_pct and depleted_events, plus the battery sensitivity file."""
    for f in D.DEFAULT_EXPORTS_DIR.glob("*.csv"):
        df = pd.read_csv(f)
        if f.name.startswith("exp_"):
            df["urgent_on_time_pct"] = 100.0
            df["depleted_events"] = 0
        df.to_csv(tmp_path / f.name, index=False)
    batt = pd.read_csv(D.DEFAULT_EXPORTS_DIR / "exp_sensitivity.csv")
    batt["urgent_on_time_pct"] = 100.0
    batt["depleted_events"] = 0
    batt["battery_use_pct_per_km"] = [5, 5, 5, 8, 8, 8, 11, 11, 11, 14, 14, 14, 17, 17, 17, 20, 20, 20]
    batt.to_csv(tmp_path / "exp_sensitivity_battery.csv", index=False)
    at = run_app(monkeypatch, exports=tmp_path)
    assert_clean(at)
    assert any("Final calibrated" in s.value for s in at.success)


def test_app_with_daily_kpis_for_several_policies(monkeypatch, tmp_path):
    for f in D.DEFAULT_EXPORTS_DIR.glob("*.csv"):
        shutil.copy(f, tmp_path)
    d = pd.read_csv(D.DEFAULT_EXPORTS_DIR / "daily_kpis.csv")
    d2 = d.copy()
    d2["policy"] = 2
    pd.concat([d, d2]).to_csv(tmp_path / "daily_kpis.csv", index=False)
    at = run_app(monkeypatch, exports=tmp_path)
    assert_clean(at)
    at.radio(key="daily_policy").set_value(2).run()
    assert_clean(at)


def test_app_twin_offline(monkeypatch):
    at = run_app(monkeypatch, twin="http://127.0.0.1:9")
    assert_clean(at)
    assert any("isn't running" in i.value for i in at.info)


def test_app_twin_online(monkeypatch, twin_server):
    at = run_app(monkeypatch, twin=twin_server)
    assert_clean(at)
    assert not any("isn't running" in i.value for i in at.info)
    at.toggle(key="twin_couriers").set_value(False).run()
    assert_clean(at)
