"""
MDC North Campus Mail Robots: Streamlit dashboard (Issue #3, Option 2 campus courier)
Course: CAI 4830C Simulation for Applied AI, Miami Dade College
Owner: Illia Shybanov (dashboard)

Run:  cd dashboard  ->  streamlit run app.py   (http://localhost:8501)

Every number comes from the project's own outputs (see data.py):
  AnyLogic exports (anylogic_model/exports/), RL results (rl_models/*.json) and the 3D twin (/api/robots).
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import data as D
import styles as S

st.set_page_config(
    page_title="MDC Campus Courier Dashboard",
    page_icon=":material/local_shipping:",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --------------------------------------------------------------------------------------------------
# Look and feel (styles.py: one layout, three skins; DASHBOARD_STYLE picks one)
# --------------------------------------------------------------------------------------------------
STYLE = S.current()
P = S.palette(STYLE)
MDC_BLUE, MDC_NAVY = P["blue"], P["navy"]
INK, MUTED, GRID, SURFACE, FILL = P["ink"], P["muted"], P["grid"], P["surface"], P["fill"]
TEAL, AMBER, RUST, SLATE = P["teal"], P["amber"], P["rust"], P["slate"]
GOOD, BAD = P["good"], P["bad"]
POLICY_COLORS = {"Baseline (FIFO)": SLATE, "Batching": AMBER, "Q-learning": TEAL, "PPO": MDC_BLUE}
SERIES = [MDC_BLUE, TEAL, AMBER, RUST, SLATE]
PLOTLY_CONFIG = {"displaylogo": False, "modeBarButtonsToRemove": ["lasso2d", "select2d"]}

st.markdown(S.css(STYLE), unsafe_allow_html=True)


def style_fig(fig: go.Figure, height: int = 360, title: str | None = None, legend: bool = True) -> go.Figure:
    fig.update_layout(
        template=P["template"],
        height=height,
        margin=dict(l=10, r=10, t=48 if title else 18, b=10 if not legend else 30),
        title=dict(text=title, x=0, xanchor="left", font=dict(size=15, color=INK, family=P["display"]))
        if title else None,
        font=dict(family=P["body"], size=13, color=INK),
        colorway=SERIES,
        hoverlabel=dict(bgcolor=SURFACE, bordercolor=GRID, font=dict(color=INK, family=P["body"])),
        legend=dict(orientation="h", yanchor="top", y=-0.22, xanchor="center", x=0.5, title=None)
        if legend else None,
        showlegend=legend,
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
    )
    fig.update_xaxes(gridcolor=GRID, zeroline=False, linecolor=GRID, title_font=dict(size=12, color=MUTED))
    fig.update_yaxes(gridcolor=GRID, zeroline=False, linecolor=GRID, title_font=dict(size=12, color=MUTED))
    return fig


def section(num: str, title: str, note: str = "") -> None:
    note_html = f'<div class="section-note">{note}</div>' if note else ""
    st.markdown(f'<div class="sec"><span class="num">{num}</span><h2>{title}</h2></div>{note_html}',
                unsafe_allow_html=True)


def sub(title: str) -> None:
    st.markdown(f'<div class="subhead">{title}</div>', unsafe_allow_html=True)


def chart(fig: go.Figure, key: str) -> None:
    st.plotly_chart(fig, config=PLOTLY_CONFIG, key=key, width="stretch")


def table(df: pd.DataFrame, **kwargs) -> None:
    st.dataframe(df, hide_index=True, width="stretch", **kwargs)


def kpi(label: str, value: str, sub: str = "", variant: str = "") -> str:
    return (f'<div class="kpi {variant}"><div class="label">{label}</div>'
            f'<div class="value">{value}</div><div class="sub">{sub}</div></div>')


def kpi_row(cards: list[str]) -> None:
    """Cards in a CSS grid that wraps on narrow screens instead of squeezing the text."""
    st.markdown(f'<div class="kpi-grid">{"".join(cards)}</div>', unsafe_allow_html=True)


def delta(new, old, lower_is_better: bool, fmt: str = "{:+.1f}", unit: str = "") -> str:
    """Coloured change vs. the model's default setup."""
    if new is None or old is None or pd.isna(new) or pd.isna(old):
        return ""
    d = new - old
    if abs(d) < 1e-9:
        return "same as default setup"
    good = (d < 0) == lower_is_better
    return f'<span class="{"up" if good else "down"}">{fmt.format(d)}{unit}</span> vs. default setup'


def missing(what: str, file_hint: str) -> None:
    st.info(f"**{what}** isn't available yet. Expected file: `{file_hint}`. The dashboard will pick it up "
            f"automatically as soon as it exists.", icon=":material/folder_open:")


def fmt_money(v) -> str:
    return "—" if v is None or pd.isna(v) else f"${v:,.0f}"


def fmt_num(v, f="{:,.1f}") -> str:
    return "—" if v is None or pd.isna(v) else f.format(v)


# --------------------------------------------------------------------------------------------------
# Data (cached per file modification time, so new CSVs show up on the next rerun)
# --------------------------------------------------------------------------------------------------
@st.cache_data(show_spinner=False)
def cached_exports(folder: str, stamp: tuple) -> dict:
    return D.load_exports(Path(folder))


@st.cache_data(show_spinner=False)
def cached_rl(folder: str, stamp: tuple) -> dict:
    return D.load_rl(Path(folder))


def stamp(folder: Path, names) -> tuple:
    return tuple(D.file_mtime(folder / n) for n in names)


# --------------------------------------------------------------------------------------------------
# Sidebar
# --------------------------------------------------------------------------------------------------
with st.sidebar:
    st.markdown('<div class="brand"><span class="brand-mark">MDC</span><div><b>Campus Courier</b>'
                '<small>North Campus mail robots · Option 2</small></div></div>', unsafe_allow_html=True)
    st.markdown('<div class="side-label">Scenario</div>', unsafe_allow_html=True)
    robots_in = st.slider("Courier robots", 1, 6, D.DEFAULT_SETUP["robots"],
                          help="Fleet size. Each robot carries 5 package slots (25 letters = 1 slot).")
    pads_in = st.slider("Charging pads", 1, 3, D.DEFAULT_SETUP["pads"], help="Charging pads at the mailroom.")
    batch_in = st.select_slider("Batch fill before dispatch (%)", options=[40, 60, 80, 100],
                                value=int(D.DEFAULT_SETUP["batch_fill_pct"]),
                                help="How full a robot must be before the batching policy sends it.")
    amazon_in = st.slider("Amazon volume, arrival rate λ (packages/day)", 10, 60,
                          int(D.DEFAULT_SETUP["amazon_per_day"]), step=5,
                          help="Amazon packages per day, the main driver of the mail arrival rate.")

    with st.expander("Cost assumptions", expanded=False):
        cost_robot = st.number_input("Robot cost ($ per robot-day)", 0.0, 500.0, D.COST_DEFAULTS["robot_day"], 5.0)
        cost_late = st.number_input("Late-item penalty ($ per item)", 0.0, 100.0, D.COST_DEFAULTS["late_item"], 1.0)
        cost_wait = st.number_input("Waiting cost ($ per item-hour)", 0.0, 10.0, D.COST_DEFAULTS["item_hour"], 0.05)
        st.caption("The model priced runs at $35 / $5 / $0.25. Changing these re-prices every run.")
    costs = {"robot_day": cost_robot, "late_item": cost_late, "item_hour": cost_wait}

    with st.expander("Data sources", expanded=False):
        default_exp = D.default_exports_dir()
        options = {"Committed exports (anylogic_model/exports)": str(default_exp)}
        if D.MODEL_OUTPUT_DIR.is_dir():
            options["Latest local AnyLogic run (campus_courier/output)"] = str(D.MODEL_OUTPUT_DIR)
        options["Custom folder…"] = ""
        choice = st.radio("AnyLogic CSV folder", list(options), index=0)
        if choice == "Custom folder…":
            exports_dir = D.resolve_dir(st.text_input("Folder path", str(default_exp)), default_exp)
        else:
            exports_dir = Path(options[choice])
        rl_dir = D.resolve_dir(st.text_input("RL results folder", str(D.default_rl_dir())), D.default_rl_dir())
        twin_url = st.text_input("3D twin server", D.default_twin_url())
        if st.button("Reload data", width="stretch"):
            st.cache_data.clear()

exports = cached_exports(str(exports_dir), stamp(exports_dir, D.EXPORT_FILES.values()))
rl = cached_rl(str(rl_dir), stamp(rl_dir, D.RL_FILES.values()))

opt = D.recost(D.add_derived(exports["optimization"]), **costs)
compare = D.recost(D.add_derived(exports["compare"]), **costs)
mc = D.recost(D.add_derived(exports["monte_carlo"]), **costs)
sens = D.recost(D.add_derived(exports["sensitivity"]), **costs)
sens_batt = D.recost(D.add_derived(exports["sensitivity_battery"]), **costs)
calib = D.add_derived(exports["calibration"])
daily = exports["daily"]
rl_table = D.rl_comparison(rl["ppo"], rl["q_learning"])
final_data = D.exports_are_final(exports)

with st.sidebar:
    st.markdown('<div class="side-label">Data status</div>', unsafe_allow_html=True)
    n_found = sum(v is not None for v in exports.values())
    st.markdown(f"AnyLogic files: **{n_found}/{len(exports)}** · RL files: "
                f"**{sum(v is not None for v in rl.values())}/{len(rl)}**")
    if final_data:
        st.success("Final calibrated exports (21 columns).", icon=":material/check_circle:")
    elif n_found:
        st.warning("Sample exports from test runs before calibration. Final numbers come from Ricardo's "
                   "re-runs; drop the new CSVs in and press Reload.", icon=":material/science:")
    else:
        st.error(f"No AnyLogic CSVs found in `{exports_dir}`.", icon=":material/warning:")

# --------------------------------------------------------------------------------------------------
# Header
# --------------------------------------------------------------------------------------------------
n_runs = sum(len(f) for f in (opt, compare, mc, sens, calib) if f is not None)
status_txt = "Final exports" if final_data else ("Sample exports" if n_found else "No exports")
st.markdown(
    f"""
<div class="mast">
  <div class="eyebrow">CAI 4830C · Simulation for Applied AI · Miami Dade College</div>
  <h1>North Campus Mail Robots</h1>
  <p>Courier robots carry vendor mail from the Duplicating &amp; Mail Center (Building 3, Room 3103) to a locker at
  every building. A multi-method AnyLogic model, Q-learning vs. PPO dispatch, and a live 3D twin.</p>
  <div class="facts">
    <div class="fact"><b>{n_runs}</b><span>AnyLogic runs loaded</span></div>
    <div class="fact"><b>5</b><span>experiments</span></div>
    <div class="fact"><b>{len(rl_table)}</b><span>dispatch policies compared</span></div>
    <div class="fact"><b>{status_txt}</b><span>data status</span></div>
  </div>
</div>
""",
    unsafe_allow_html=True,
)

tab_ops, tab_ai, tab_exp, tab_twin, tab_exec = st.tabs([
    ":material/monitoring: Operational KPIs", ":material/model_training: AI Policy Comparison",
    ":material/science: AnyLogic Experiments", ":material/view_in_ar: 3D Digital Twin",
    ":material/summarize: Executive Report",
])

# ==================================================================================================
# Tab 1 — Operational KPIs
# ==================================================================================================
with tab_ops:
    section("01", "Operational KPIs", "The closest real AnyLogic run to the sidebar settings (Optimization and "
            "Sensitivity experiments, batching policy, 30 working days).")

    pool = [f for f in (opt, sens, mc) if f is not None]
    pool_df = pd.concat(pool, ignore_index=True) if pool else None
    if pool_df is not None and "policy" in pool_df:
        pool_df = pool_df[pool_df["policy"] == 1]
    run, exact = D.closest_run(pool_df, robots_in, pads_in, batch_in, amazon_in)
    ref = mc if mc is not None else None  # default setup reference (6 robots, 2 pads, 60%, 25/day)

    if run is None:
        missing("Experiment runs", "anylogic_model/exports/exp_optimization.csv")
    else:
        ref_mean = (lambda c: float(ref[c].mean()) if ref is not None and c in ref else None)
        is_default = ref is not None and int(run["robots"]) == D.DEFAULT_SETUP["robots"] and int(run["pads"]) == \
            D.DEFAULT_SETUP["pads"] and float(run["batch_fill_pct"]) == D.DEFAULT_SETUP["batch_fill_pct"]
        if not exact:
            st.caption(f"No run with exactly these settings. Showing the closest one: **{int(run['robots'])} "
                       f"robots · {int(run['pads'])} pads · {run['batch_fill_pct']:.0f}% batch · "
                       f"{run['amazon_per_day']:.0f} Amazon/day**. See the what-if estimate below for your exact "
                       f"settings.")
        cmp = (lambda c, lib, f="{:+.1f}", u="": "" if is_default else delta(run.get(c), ref_mean(c), lib, f, u))
        kpi_row([
            kpi("Avg wait", f"{run['avg_hours_to_locker']:.1f} h",
                cmp("avg_hours_to_locker", True, u=" h") or "vendor drop → locker"),
            kpi("Throughput", f"{run['throughput_per_hr']:.0f} /h",
                cmp("throughput_per_hr", False, "{:+.0f}", " /h") or "items per operating hour", "alt"),
            kpi("SLA violations", f"{run['sla_violation_pct']:.1f}%",
                f"same-day {run['same_day_pct']:.1f}% · late items {int(run['late_items'])}", "warn"),
            kpi("Battery / robot-day", f"{run['battery_per_robot_day']:.0f}%",
                cmp("battery_per_robot_day", True, "{:+.0f}", "%") or "of one battery", "alt"),
            kpi("Monthly cost", fmt_money(run["cost"]),
                cmp("cost", True, "{:+,.0f}", " $") or f"${run['cost_per_item']:.2f} per item"),
            kpi("Robot distance", f"{run['robot_km']:,.0f} km", f"{int(run['delivered']):,} items delivered"),
        ])

    # What-if estimate
    st.markdown("")
    with st.container(border=True):
        sub("What-if estimate for your exact settings")
        model = D.fit_whatif([opt, sens, mc])
        est = D.predict_whatif(model, robots_in, pads_in, batch_in, amazon_in, costs)
        if est is None:
            st.caption("Not enough experiment runs to fit an estimate.")
        else:
            r2 = model["r2"]
            st.caption(f"**Estimate, not a simulation run.** A regression fitted on {model['n']} real AnyLogic runs "
                       f"(fit R²: cost {r2.get('monthly_cost', float('nan')):.2f}, km "
                       f"{r2.get('robot_km', float('nan')):.2f}, hours {r2.get('avg_hours_to_locker', float('nan')):.2f})."
                       f" Use it to explore between runs, then confirm in AnyLogic.")
            if est["extrapolating"]:
                st.warning("Some settings are outside the range of the runs, so this estimate is extrapolated.",
                           icon=":material/warning:")
            c = st.columns(5)
            c[0].metric("Wait (h)", f"{est['avg_hours_to_locker']:.2f}")
            c[1].metric("Throughput (/h)", f"{est['throughput_per_hr']:.0f}")
            c[2].metric("Robot km / month", f"{est['robot_km']:,.0f}")
            c[3].metric("Battery / robot-day", f"{est['battery_per_robot_day']:.0f}%")
            c[4].metric("Monthly cost", fmt_money(est.get("cost")))

    # Trade-off explorer: cost vs. fleet size
    left, right = st.columns([3, 2])
    with left:
        if opt is not None:
            g = opt.groupby("robots").agg(cost=("cost", "mean"), hours=("avg_hours_to_locker", "mean"),
                                          km=("robot_km", "mean"), n=("cost", "size")).reset_index()
            fig = go.Figure()
            fig.add_bar(x=g["robots"], y=g["cost"], name="Monthly cost ($)", marker_color=MDC_BLUE,
                        customdata=g[["n"]], hovertemplate="%{x} robots<br>$%{y:,.0f}/month<br>%{customdata[0]} runs"
                                                            "<extra></extra>")
            fig.add_scatter(x=g["robots"], y=g["hours"], name="Hours to locker", yaxis="y2", mode="lines+markers",
                            line=dict(color=AMBER, width=3), marker=dict(size=9),
                            hovertemplate="%{x} robots<br>%{y:.2f} h to locker<extra></extra>")
            fig.add_vline(x=robots_in, line_dash="dot", line_color=MUTED)
            fig.update_layout(yaxis=dict(title="Monthly cost ($)"), xaxis=dict(title="Courier robots", dtick=1),
                              yaxis2=dict(title="Hours to locker", overlaying="y", side="right", showgrid=False))
            chart(style_fig(fig, 360, "Fleet size trade-off: cost vs. delivery wait"), "ops_tradeoff")
        else:
            missing("Optimization experiment", "exp_optimization.csv")
    with right:
        if sens is not None:
            g = sens.groupby("amazon_per_day").agg(items=("arrived", "mean"), km=("robot_km", "mean")).reset_index()
            fig = go.Figure()
            fig.add_scatter(x=g["amazon_per_day"], y=g["items"] / sens["work_days"].max(), name="Items / day",
                            mode="lines+markers", line=dict(color=MDC_BLUE, width=3),
                            hovertemplate="λ = %{x}/day<br>%{y:.0f} items/day<extra></extra>")
            fig.add_scatter(x=g["amazon_per_day"], y=g["km"], name="Robot km / month", yaxis="y2",
                            mode="lines+markers", line=dict(color=TEAL, width=3),
                            hovertemplate="λ = %{x}/day<br>%{y:,.0f} km/month<extra></extra>")
            fig.add_vline(x=amazon_in, line_dash="dot", line_color=MUTED)
            fig.update_layout(xaxis=dict(title="Amazon packages / day (λ)"), yaxis=dict(title="Items / day"),
                              yaxis2=dict(title="Robot km / month", overlaying="y", side="right", showgrid=False))
            chart(style_fig(fig, 360, "Arrival rate λ vs. workload"), "ops_lambda")
        else:
            missing("Amazon-volume sensitivity", "exp_sensitivity.csv")

    # Daily trends
    sub("Day-by-day trend (Simulation experiment)")
    if daily is None:
        missing("Daily KPIs", "daily_kpis.csv")
    else:
        d = daily.copy()
        if "policy" in d and d["policy"].nunique() > 1:
            names = {p: D.POLICY_NAMES.get(int(p), str(p)) for p in sorted(d["policy"].unique())}
            pick = st.radio("Policy", list(names), format_func=names.get, horizontal=True, key="daily_policy")
            d = d[d["policy"] == pick]
        n_days = len(d)
        pol = D.POLICY_NAMES.get(int(d["policy"].iloc[0]), "") if "policy" in d else ""
        st.markdown(f'<div class="section-note">{n_days} simulated working day(s), {pol} policy. The full run '
                    f'covers 30 working days.</div>', unsafe_allow_html=True)
        a, b = st.columns(2)
        with a:
            fig = go.Figure()
            fig.add_bar(x=d["day"], y=d["arrived"], name="Arrived", marker_color=FILL,
                        hovertemplate="Day %{x}<br>%{y} arrived<extra></extra>")
            fig.add_bar(x=d["day"], y=d["delivered"] if "delivered" in d else d["same_day"], name="Delivered",
                        marker_color=MDC_BLUE, hovertemplate="Day %{x}<br>%{y} delivered<extra></extra>")
            if "same_day_pct" in d:
                fig.add_scatter(x=d["day"], y=d["same_day_pct"], name="Same-day %", yaxis="y2",
                                mode="lines+markers", line=dict(color=TEAL, width=3),
                                hovertemplate="Day %{x}<br>%{y:.1f}% same day<extra></extra>")
            fig.update_layout(barmode="group", xaxis=dict(title="Working day", dtick=1),
                              yaxis=dict(title="Mail items"),
                              yaxis2=dict(title="Same-day %", overlaying="y", side="right", range=[0, 105],
                                          showgrid=False))
            chart(style_fig(fig, 340, "Mail volume and same-day service"), "daily_volume")
        with b:
            fig = go.Figure()
            fig.add_scatter(x=d["day"], y=d["robot_km"], name="Robot km", mode="lines+markers",
                            line=dict(color=MDC_BLUE, width=3),
                            hovertemplate="Day %{x}<br>%{y:.1f} km<extra></extra>")
            if "max_in_mailroom" in d:
                fig.add_bar(x=d["day"], y=d["max_in_mailroom"], name="Peak items waiting in mailroom", yaxis="y2",
                            marker_color="rgba(232,163,61,0.38)",
                            hovertemplate="Day %{x}<br>peak %{y} items waiting<extra></extra>")
                fig.data = fig.data[::-1]  # bars behind the line
            fig.update_layout(xaxis=dict(title="Working day", dtick=1), yaxis=dict(title="Robot km"),
                              yaxis2=dict(title="Peak items waiting", overlaying="y", side="right", showgrid=False,
                                          rangemode="tozero"))
            chart(style_fig(fig, 340, "Robot distance vs. mailroom backlog"), "daily_energy")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Avg hours to locker", fmt_num(d["avg_hours_to_locker"].mean(), "{:.2f}")
                  if "avg_hours_to_locker" in d else "—")
        c2.metric("Battery used / day", fmt_num(d["energy_pct"].mean(), "{:.0f}%") if "energy_pct" in d else "—",
                  help="Share of one robot battery used per day, whole fleet")
        c3.metric("Late vendor drops", fmt_num(d["late_drops"].sum(), "{:,.0f}") if "late_drops" in d else "—")
        c4.metric("Clerk utilization", fmt_num(d["clerk_util_pct"].mean(), "{:.1f}%") if "clerk_util_pct" in d else "—")

# ==================================================================================================
# Tab 2 — AI Policy Comparison
# ==================================================================================================
with tab_ai:
    section("02", "Baseline vs. Q-learning vs. PPO", "From Jordan's Option 2 training in <code>rl_models/</code>: "
            "the same campus mail day (5-minute dispatch decisions 08:00–17:00), evaluated on identical seeds.")
    ppo, ql = rl["ppo"], rl["q_learning"]
    if rl_table.empty:
        missing("RL results", "rl_models/ppo_results.json and q_learning_results.json")
    else:
        t = rl_table.set_index("key")
        cards = []
        for key, variant in (("fifo", "warn"), ("q_learning", "alt"), ("ppo", "")):
            if key in t.index:
                r = t.loc[key]
                cards.append(kpi(r["Policy"], fmt_num(r["Avg reward / day"], "{:.1f}"),
                                 f"reward/day · same-day {fmt_num(r['Same-day %'], '{:.1f}')}% · "
                                 f"end battery {fmt_num(r['Battery at day end %'], '{:.0f}')}%", variant))
        if "ppo" in t.index and "fifo" in t.index:
            gain = (t.loc["ppo", "Avg reward / day"] - t.loc["fifo", "Avg reward / day"]) / abs(
                t.loc["fifo", "Avg reward / day"]) * 100
            cards.append(kpi("PPO vs. FIFO", f"+{gain:.0f}%", "higher daily reward", "alt"))
        kpi_row(cards)
        st.markdown("")

        metrics = [("Avg reward / day", "Average daily reward (higher is better)", "{:.1f}"),
                   ("Battery at day end %", "Battery left at day end (%)", "{:.0f}%"),
                   ("Robot km / day", "Robot km per day", "{:.1f}"),
                   ("SLA violation %", "SLA violation rate (%)", "{:.2f}%")]
        cols = st.columns(2)
        for i, (col, title, fmt) in enumerate(metrics):
            if col not in rl_table:
                continue
            fig = go.Figure(go.Bar(
                x=rl_table["Policy"], y=rl_table[col],
                marker_color=[POLICY_COLORS.get(p, MDC_BLUE) for p in rl_table["Policy"]],
                text=[fmt.format(v) if v is not None and not pd.isna(v) else "" for v in rl_table[col]],
                textposition="outside", cliponaxis=False,
                hovertemplate="%{x}<br>" + col + ": %{y:.3f}<extra></extra>"))
            fig.update_yaxes(title=col)
            with cols[i % 2]:
                chart(style_fig(fig, 300, title, legend=False), f"rl_bar_{i}")

        sub("Learning curves")
        win = st.slider("Smoothing window (episodes)", 1, 100, 25, key="rl_window")
        a, b = st.columns(2)
        with a:
            fig = go.Figure()
            if ql and ql.get("episode_rewards"):
                y = ql["episode_rewards"]
                fig.add_scatter(x=list(range(1, len(y) + 1)), y=y, name="Q-learning (raw)", mode="lines",
                                line=dict(color=TEAL, width=1), opacity=0.25,
                                hovertemplate="Episode %{x}<br>reward %{y:.1f}<extra></extra>")
                fig.add_scatter(x=list(range(1, len(y) + 1)), y=D.rolling_mean(y, win), mode="lines",
                                name=f"Q-learning ({win}-ep mean)", line=dict(color=TEAL, width=3),
                                hovertemplate="Episode %{x}<br>mean %{y:.1f}<extra></extra>")
            ref_lines = [("fifo", "FIFO baseline", SLATE), ("batching", "Batching", AMBER),
                         ("ppo", "PPO (evaluation)", MDC_BLUE)]
            n_ep = len(ql["episode_rewards"]) if ql and ql.get("episode_rewards") else 1
            for key, name, color in ref_lines:
                if key in t.index and t.loc[key, "Avg reward / day"] is not None:
                    yv = t.loc[key, "Avg reward / day"]
                    fig.add_scatter(x=[1, n_ep], y=[yv, yv], mode="lines", name=f"{name} ({yv:.1f})",
                                    line=dict(color=color, width=2, dash="dash"),
                                    hovertemplate=f"{name}: {yv:.1f}<extra></extra>")
            fig.update_layout(xaxis=dict(title="Training episode (1 episode = 1 working day)"),
                              yaxis=dict(title="Episode reward"))
            chart(style_fig(fig, 380, f"Q-learning training ({ql.get('episodes', '?') if ql else '?'} episodes)"),
                  "rl_q_curve")
        with b:
            fig = go.Figure()
            if ppo and ppo.get("episode_rewards"):
                y = ppo["episode_rewards"]
                fig.add_scatter(x=list(range(1, len(y) + 1)), y=y, name="PPO", mode="lines+markers",
                                line=dict(color=MDC_BLUE, width=2), marker=dict(size=6),
                                hovertemplate="Eval day %{x}<br>reward %{y:.1f}<extra></extra>")
            if ql and ql.get("episode_rewards"):
                y = ql["episode_rewards"][-50:]
                fig.add_scatter(x=list(range(1, len(y) + 1)), y=y, name="Q-learning (last 50)", mode="lines+markers",
                                line=dict(color=TEAL, width=2), marker=dict(size=6),
                                hovertemplate="Day %{x}<br>reward %{y:.1f}<extra></extra>")
            if "fifo" in t.index:
                yv = t.loc["fifo", "Avg reward / day"]
                fig.add_scatter(x=[1, 50], y=[yv, yv], mode="lines", name=f"FIFO baseline ({yv:.1f})",
                                line=dict(color=SLATE, width=2, dash="dash"),
                                hovertemplate=f"FIFO baseline: {yv:.1f}<extra></extra>")
            fig.update_layout(xaxis=dict(title="Evaluation day"), yaxis=dict(title="Daily reward"))
            chart(style_fig(fig, 380, "Trained policies on 50 evaluation days"), "rl_eval")
        st.caption(f"PPO: {ppo.get('algorithm', 'PPO') if ppo else '—'}, {ppo.get('episodes', '?') if ppo else '?'} "
                   f"training episodes; its JSON stores the 50 evaluation days. Q-learning: full per-episode history.")

        if ql and ql.get("same_day_history"):
            sd = ql["same_day_history"]
            viol = [max(0.0, 100.0 - v) for v in sd]
            fig = go.Figure()
            fig.add_scatter(x=list(range(1, len(sd) + 1)), y=D.rolling_mean(viol, win), mode="lines",
                            name="SLA violation %", line=dict(color=RUST, width=3), fill="tozeroy",
                            fillcolor="rgba(194,65,12,0.12)",
                            hovertemplate="Episode %{x}<br>%{y:.2f}% not same-day<extra></extra>")
            if ql.get("backlog_history"):
                fig.add_scatter(x=list(range(1, len(sd) + 1)), y=D.rolling_mean(ql["backlog_history"], win),
                                mode="lines", name="Items left at day end", yaxis="y2",
                                line=dict(color=MUTED, width=2, dash="dot"),
                                hovertemplate="Episode %{x}<br>%{y:.2f} items left<extra></extra>")
            fig.update_layout(xaxis=dict(title="Training episode"), yaxis=dict(title="SLA violation % (smoothed)"),
                              yaxis2=dict(title="Items left", overlaying="y", side="right", showgrid=False, rangemode="tozero"),
                              yaxis_rangemode="tozero")
            chart(style_fig(fig, 300, "Q-learning SLA violations during training"), "rl_sla")

        with st.expander("Full comparison table"):
            table(rl_table.drop(columns=["key"]).round(2))

    sub("Inside AnyLogic: Compare Runs experiment")
    if compare is None:
        missing("Compare Runs experiment", "exp_compare_runs.csv")
    else:
        g = compare.groupby("policy_name", sort=False).agg(
            runs=("cost", "size"), cost=("cost", "mean"), hours=("avg_hours_to_locker", "mean"),
            km=("robot_km", "mean"), energy=("energy_pct", "mean"), same_day=("same_day_pct", "mean"),
            late=("late_items", "mean")).reset_index()
        order = [p for p in D.POLICY_NAMES.values() if p in set(g["policy_name"])]
        g = g.set_index("policy_name").loc[order].reset_index()
        cols = st.columns(3)
        for i, (col, title, fmt) in enumerate([("cost", "Monthly cost ($)", "${:,.0f}"),
                                               ("hours", "Hours drop → locker", "{:.2f} h"),
                                               ("km", "Robot km / month", "{:,.0f}")]):
            fig = go.Figure(go.Bar(x=g["policy_name"], y=g[col],
                                   marker_color=[POLICY_COLORS.get(p, MDC_BLUE) for p in g["policy_name"]],
                                   text=[fmt.format(v) for v in g[col]], textposition="outside", cliponaxis=False,
                                   hovertemplate="%{x}<br>%{y:,.2f}<extra></extra>"))
            with cols[i]:
                chart(style_fig(fig, 290, title, legend=False), f"cmp_{col}")
        if "PPO" not in order:
            st.caption("PPO inside AnyLogic (dispatchPolicy = 3) appears here once Ricardo's Compare Runs include it.")
        table(g.rename(columns={"policy_name": "Policy", "runs": "Runs", "cost": "Cost ($/mo)",
                                "hours": "Hours to locker", "km": "Robot km", "energy": "Battery used (%)",
                                "same_day": "Same-day %", "late": "Late items"}).round(2))

    qp = D.q_policy(rl["q_table"]) if rl["q_table"] is not None else D.q_policy(exports["q_table"])
    if qp is not None and qp["visited"].any():
        sub("What the Q-learning agent learned")
        v = qp[qp["visited"]]
        a, b = st.columns([2, 3])
        with a:
            counts = v["best_action"].value_counts().reindex(D.ACTIONS, fill_value=0)
            fig = go.Figure(go.Pie(labels=counts.index, values=counts.values, hole=0.55, sort=False,
                                   marker=dict(colors=[SLATE, MDC_BLUE, TEAL, AMBER], line=dict(color=SURFACE, width=2)),
                                   hovertemplate="%{label}: %{value} states<extra></extra>"))
            chart(style_fig(fig, 320, f"Best action in {len(v)} visited states"), "q_pie")
        with b:
            pivot = v.groupby(["ready_label", "block_label"])["best_action"].agg(lambda s: s.value_counts().idxmax())
            z_map = {a_: i for i, a_ in enumerate(D.ACTIONS)}
            rows_, cols_ = D.STATE_LEVELS["ready"], D.STATE_LEVELS["block"]
            z = [[z_map.get(pivot.get((r, c_)), np.nan) for c_ in cols_] for r in rows_]
            text = [[pivot.get((r, c_), "") for c_ in cols_] for r in rows_]
            fig = go.Figure(go.Heatmap(
                z=z, x=cols_, y=rows_, text=text, texttemplate="%{text}", showscale=False, zmin=0, zmax=3,
                colorscale=[[0, SLATE], [0.33, MDC_BLUE], [0.66, TEAL], [1, AMBER]], opacity=0.55,
                hovertemplate="Mail ready: %{y}<br>Time: %{x}<br>Most common best action: %{text}<extra></extra>"))
            fig.update_layout(xaxis=dict(title="Time of day"), yaxis=dict(title="Sorted mail waiting"))
            chart(style_fig(fig, 320, "Most common best action by mail waiting × time", legend=False), "q_heat")

# ==================================================================================================
# Tab 3 — AnyLogic Experiments
# ==================================================================================================
with tab_exp:
    section("03", "The 5 AnyLogic experiments", "Optimization, Monte Carlo, Sensitivity, Calibration and "
            "Compare Runs, read from the experiment exports.")
    e_opt, e_mc, e_sens, e_cal, e_cmp = st.tabs(["Optimization", "Monte Carlo", "Sensitivity", "Calibration",
                                                 "Compare Runs"])

    with e_opt:
        if opt is None:
            missing("Optimization experiment", "exp_optimization.csv")
        else:
            ok = opt[(opt["same_day_pct"] >= 99.5) & (opt["late_items"] == 0)]
            best = (ok if not ok.empty else opt).loc[(ok if not ok.empty else opt)["cost"].idxmin()]
            kpi_row([
                kpi("Best solution", f"{int(best['robots'])} robots · {int(best['pads'])} pads",
                    f"{best['batch_fill_pct']:.0f}% batch fill"),
                kpi("Monthly cost", fmt_money(best["cost"]), f"${best['cost_per_item']:.2f} per item", "alt"),
                kpi("Hours to locker", f"{best['avg_hours_to_locker']:.1f} h",
                    f"same-day {best['same_day_pct']:.1f}%", "alt"),
                kpi("Runs evaluated", f"{len(opt)}", "constraint: ≥99.5% same-day, 0 late", "warn"),
            ])
            st.markdown("")
            a, b = st.columns([3, 2])
            with a:
                pm = D.pareto_mask(opt, "cost", "avg_hours_to_locker")
                fig = go.Figure()
                for pads_v, sym in zip(sorted(opt["pads"].unique()), ["circle", "diamond", "square"]):
                    s = opt[opt["pads"] == pads_v]
                    fig.add_scatter(
                        x=s["cost"], y=s["avg_hours_to_locker"], mode="markers", name=f"{int(pads_v)} pad(s)",
                        marker=dict(size=8 + 3 * s["robots"], color=s["robots"], colorscale="Blues", cmin=0, cmax=6,
                                    symbol=sym, line=dict(color=SURFACE, width=1),
                                    colorbar=dict(title="Robots", len=0.6) if pads_v == opt["pads"].min() else None,
                                    showscale=bool(pads_v == opt["pads"].min())),
                        customdata=s[["robots", "pads", "batch_fill_pct", "robot_km", "late_items"]],
                        hovertemplate="%{customdata[0]} robots · %{customdata[1]} pads · %{customdata[2]}% batch"
                                      "<br>$%{x:,.0f}/month · %{y:.1f} h<br>%{customdata[3]:,.0f} km · "
                                      "%{customdata[4]} late<extra></extra>")
                front = opt[pm].sort_values("cost")
                fig.add_scatter(x=front["cost"], y=front["avg_hours_to_locker"], mode="lines", name="Pareto front",
                                line=dict(color=RUST, width=2, dash="dash"), hoverinfo="skip")
                fig.add_scatter(x=[best["cost"]], y=[best["avg_hours_to_locker"]], mode="markers", name="Best",
                                marker=dict(symbol="star", size=20, color=AMBER, line=dict(color=INK, width=1)),
                                hovertemplate="Best solution<extra></extra>")
                fig.update_layout(xaxis=dict(title="Monthly cost ($)"), yaxis=dict(title="Hours vendor drop → locker"))
                chart(style_fig(fig, 420, "Pareto trade-off: cost vs. delivery wait"), "opt_pareto")
            with b:
                hm = opt.pivot_table(index="robots", columns="batch_fill_pct", values="cost", aggfunc="min")
                fig = go.Figure(go.Heatmap(
                    z=hm.values, x=[f"{c:.0f}%" for c in hm.columns], y=[f"{int(r)} robots" for r in hm.index],
                    colorscale="Blues", reversescale=True, colorbar=dict(title="$/mo"),
                    text=[[fmt_money(v) if not pd.isna(v) else "" for v in row] for row in hm.values],
                    texttemplate="%{text}", hovertemplate="%{y} · %{x} batch<br>%{text}<extra></extra>"))
                fig.update_layout(xaxis=dict(title="Batch fill before dispatch"), yaxis=dict(title=""))
                chart(style_fig(fig, 420, "Cheapest run per fleet × batch fill", legend=False), "opt_heat")
            with st.expander("All optimization runs"):
                table(opt[["robots", "pads", "batch_fill_pct", "cost", "avg_hours_to_locker", "same_day_pct",
                           "late_items", "robot_km", "energy_pct"]].sort_values("cost").round(2))

    with e_mc:
        if mc is None:
            missing("Monte Carlo experiment", "exp_monte_carlo.csv")
        else:
            metric = st.radio("Metric", ["cost", "avg_hours_to_locker", "robot_km", "same_day_pct"], horizontal=True,
                              format_func={"cost": "Monthly cost", "avg_hours_to_locker": "Hours to locker",
                                           "robot_km": "Robot km", "same_day_pct": "Same-day %"}.get, key="mc_metric")
            ci = D.mean_ci(mc[metric])
            f = "${:,.0f}" if metric == "cost" else "{:,.2f}"
            kpi_row([
                kpi("Replications", f"{ci['n']}", "random 30-day months"),
                kpi("Mean", f.format(ci["mean"]), f"std {f.format(ci['std'])}", "alt"),
                kpi("95% CI of the mean", f"{f.format(ci['lo'])} – {f.format(ci['hi'])}", "± 1.96·σ/√n", "alt"),
                kpi("Range", f"{f.format(mc[metric].min())} – {f.format(mc[metric].max())}", "min – max", "warn"),
            ])
            st.markdown("")
            a, b = st.columns([3, 2])
            with a:
                fig = go.Figure(go.Histogram(x=mc[metric], nbinsx=15, marker_color=FILL,
                                             marker_line=dict(color=MDC_BLUE, width=1), name="Runs",
                                             hovertemplate="%{x}<br>%{y} runs<extra></extra>"))
                fig.add_vrect(x0=ci["lo"], x1=ci["hi"], fillcolor=MDC_BLUE, opacity=0.15, line_width=0,
                              annotation_text="95% CI", annotation_position="top left")
                fig.add_vline(x=ci["mean"], line_color=MDC_BLUE, line_width=3)
                fig.update_layout(xaxis=dict(title=metric.replace("_", " ")), yaxis=dict(title="Runs"), bargap=0.05)
                chart(style_fig(fig, 360, "Distribution across replications", legend=False), "mc_hist")
            with b:
                running = mc[metric].expanding().mean()
                sd = mc[metric].expanding().std().fillna(0)
                n = np.arange(1, len(mc) + 1)
                half = 1.96 * sd / np.sqrt(n)
                fig = go.Figure()
                fig.add_scatter(x=n, y=running + half, mode="lines", line=dict(width=0), showlegend=False,
                                hoverinfo="skip")
                fig.add_scatter(x=n, y=running - half, mode="lines", line=dict(width=0), fill="tonexty",
                                fillcolor="rgba(76,141,246,0.18)", name="95% CI", hoverinfo="skip")
                fig.add_scatter(x=n, y=running, mode="lines", line=dict(color=MDC_BLUE, width=3), name="Running mean",
                                hovertemplate="after %{x} runs: %{y:,.2f}<extra></extra>")
                fig.update_layout(xaxis=dict(title="Number of replications"), yaxis=dict(title="Running mean"))
                chart(style_fig(fig, 360, "Convergence of the mean"), "mc_conv")
            if ci["n"] < 100:
                st.caption(f"These samples have {ci['n']} replications; the final Monte Carlo has 100.")

    with e_sens:
        sets = [("Amazon volume (packages/day)", sens, "amazon_per_day", "exp_sensitivity.csv")]
        sets.append(("Battery discharge (%/km)", sens_batt,
                     next((c for c in ("battery_use_pct_per_km", "battery_pct_per_km", "batteryUsePctPerKm")
                           if sens_batt is not None and c in sens_batt), None), "exp_sensitivity_battery.csv"))
        for title, df, xcol, fname in sets:
            sub(title)
            if df is None:
                missing(f"Sensitivity on {title.split(' (')[0].lower()}", fname)
                continue
            if xcol is None:
                varying = [c for c in df.columns if c not in D.EXP_COLUMNS and df[c].nunique() > 1]
                xcol = varying[0] if varying else None
            if xcol is None:
                st.caption("Couldn't find the swept parameter column in this file.")
                continue
            g = df.groupby(xcol).agg(
                cost=("cost", "mean"), cost_sd=("cost", "std"), km=("robot_km", "mean"), km_sd=("robot_km", "std"),
                hours=("avg_hours_to_locker", "mean"), hours_sd=("avg_hours_to_locker", "std"),
                same=("same_day_pct", "mean")).reset_index().fillna(0)
            cols = st.columns(3)
            for i, (m, label) in enumerate([("cost", "Monthly cost ($)"), ("km", "Robot km / month"),
                                            ("hours", "Hours to locker")]):
                fig = go.Figure(go.Scatter(x=g[xcol], y=g[m], mode="lines+markers",
                                           error_y=dict(type="data", array=g[m + "_sd"], color=GRID, thickness=2),
                                           line=dict(color=SERIES[i], width=3), marker=dict(size=9),
                                           hovertemplate=f"{xcol}=%{{x}}<br>{label}: %{{y:,.2f}}<extra></extra>"))
                fig.update_layout(xaxis=dict(title=title), yaxis=dict(title=label))
                with cols[i]:
                    chart(style_fig(fig, 300, label + " (mean ± sd)", legend=False), f"sens_{xcol}_{m}")
            # Heatmap: normalised response of every KPI to the parameter
            kp = {"cost": "Cost", "km": "Robot km", "hours": "Hours to locker", "same": "Same-day %"}
            z = []
            for m in kp:
                base = g[m].iloc[0]
                z.append([((v - base) / abs(base) * 100.0) if base else 0.0 for v in g[m]])
            fig = go.Figure(go.Heatmap(
                z=z, x=[str(v) for v in g[xcol]], y=list(kp.values()), colorscale="RdBu", reversescale=True, zmid=0,
                text=[[f"{v:+.0f}%" for v in row] for row in z], texttemplate="%{text}",
                colorbar=dict(title="% vs. lowest"),
                hovertemplate="%{y} at %{x}: %{text} vs. lowest setting<extra></extra>"))
            fig.update_layout(xaxis=dict(title=title))
            chart(style_fig(fig, 260, "Sensitivity heatmap: % change vs. lowest setting", legend=False),
                  f"sens_heat_{xcol}")

    with e_cal:
        if calib is None:
            missing("Calibration experiment", "exp_calibration.csv")
        else:
            best = calib.loc[calib["calibration_error"].idxmin()]
            kpi_row([
                kpi("Map scale", f"{best['meters_per_unit']:.1f} m/unit", "best fit"),
                kpi("Crowd slow-down", f"{best['crowd_impact']:.3f}", "per student nearby", "alt"),
                kpi("Simulated walk", f"{best['sim_trip_quiet_min']:.1f} / {best['sim_trip_rush_min']:.1f} min",
                    f"observed {D.CALIBRATION_TARGET['quiet']:.0f} / {D.CALIBRATION_TARGET['rush']:.0f} min", "alt"),
                kpi("Calibration error", f"{best['calibration_error']:.3f}", f"best of {len(calib)} iterations",
                    "warn"),
            ])
            st.markdown("")
            a, b = st.columns(2)
            with a:
                fig = go.Figure()
                fig.add_scatter(x=calib["sim_trip_quiet_min"], y=calib["sim_trip_rush_min"], mode="markers",
                                name="Iterations",
                                marker=dict(size=10, color=np.log10(calib["calibration_error"] + 1e-3),
                                            colorscale="Blues", reversescale=True, line=dict(color=SURFACE, width=1),
                                            colorbar=dict(title="log₁₀ error", len=0.7)),
                                customdata=calib[["meters_per_unit", "crowd_impact", "calibration_error"]],
                                hovertemplate="quiet %{x:.1f} min · rush %{y:.1f} min<br>scale %{customdata[0]:.1f} "
                                              "m/unit · crowd %{customdata[1]:.3f}<br>error %{customdata[2]:.3f}"
                                              "<extra></extra>")
                fig.add_scatter(x=[D.CALIBRATION_TARGET["quiet"]], y=[D.CALIBRATION_TARGET["rush"]], mode="markers",
                                name="Observed (4 / 7 min)",
                                marker=dict(symbol="x", size=18, color=RUST, line=dict(width=2)),
                                hovertemplate="Observed: 4 min quiet, 7 min at class change<extra></extra>")
                fig.update_layout(xaxis=dict(title="Simulated trip, quiet walkways (min)"),
                                  yaxis=dict(title="Simulated trip, class change (min)"))
                chart(style_fig(fig, 380, "Simulated vs. observed Building 3 → Building 1 trip"), "cal_scatter")
            with b:
                it = np.arange(1, len(calib) + 1)
                fig = go.Figure()
                fig.add_scatter(x=it, y=calib["calibration_error"], mode="markers", name="Iteration error",
                                marker=dict(color=FILL, size=8, line=dict(color=MDC_BLUE, width=1)),
                                hovertemplate="iteration %{x}<br>error %{y:.3f}<extra></extra>")
                fig.add_scatter(x=it, y=calib["calibration_error"].cummin(), mode="lines", name="Best so far",
                                line=dict(color=MDC_BLUE, width=3, shape="hv"),
                                hovertemplate="iteration %{x}<br>best %{y:.3f}<extra></extra>")
                fig.update_layout(xaxis=dict(title="Calibration iteration"),
                                  yaxis=dict(title="Error (log scale)", type="log"))
                chart(style_fig(fig, 380, "Optimizer convergence"), "cal_conv")

    with e_cmp:
        if compare is None:
            missing("Compare Runs experiment", "exp_compare_runs.csv")
        else:
            st.markdown('<div class="section-note">Same model settings (6 robots, 2 pads, 30 days); only the dispatch policy changes.</div>',
                        unsafe_allow_html=True)
            g = compare.groupby("policy_name", sort=False).mean(numeric_only=True)
            order = [p for p in D.POLICY_NAMES.values() if p in g.index]
            g = g.loc[order]
            dims = [("cost", "Cost", True), ("avg_hours_to_locker", "Hours to locker", True),
                    ("robot_km", "Robot km", True), ("energy_pct", "Energy", True), ("late_items", "Late items", True),
                    ("throughput_per_hr", "Throughput", False)]
            fig = go.Figure()
            for p in order:
                vals = []
                for col, _, lower in dims:
                    lo, hi = g[col].min(), g[col].max()
                    score = 1.0 if hi == lo else (g.loc[p, col] - lo) / (hi - lo)
                    vals.append(round((1 - score) if lower else score, 3))
                fig.add_scatterpolar(r=vals + vals[:1], theta=[d[1] for d in dims] + [dims[0][1]], fill="toself",
                                     name=p, line=dict(color=POLICY_COLORS.get(p, MDC_BLUE), width=2), opacity=0.75)
            fig.update_layout(polar=dict(radialaxis=dict(visible=True, range=[0, 1], showticklabels=False)))
            a, b = st.columns([1, 1])
            with a:
                chart(style_fig(fig, 400, "Policy profile (outer = better)"), "cmp_radar")
            with b:
                st.markdown("")
                for p in order:
                    r = g.loc[p]
                    st.markdown(kpi(p, fmt_money(r["cost"]),
                                    f"{r['avg_hours_to_locker']:.2f} h to locker · {r['robot_km']:,.0f} km · "
                                    f"{int(r['late_items'])} late"), unsafe_allow_html=True)
                    st.markdown("")
            table(g[["cost", "avg_hours_to_locker", "robot_km", "energy_pct", "same_day_pct", "late_items",
                     "throughput_per_hr"]].rename(columns={
                "cost": "Cost ($/mo)", "avg_hours_to_locker": "Hours to locker", "robot_km": "Robot km",
                "energy_pct": "Battery used (%)", "same_day_pct": "Same-day %", "late_items": "Late items",
                "throughput_per_hr": "Items / h"}).round(2).reset_index().rename(columns={"policy_name": "Policy"}))
            st.caption(f"{len(compare)} runs in the file; repeated runs of a policy give identical results, so "
                       f"each policy is shown once (mean).")

# ==================================================================================================
# Tab 4 — 3D Digital Twin
# ==================================================================================================
with tab_twin:
    section("04", "3D digital twin: live fleet status")
    top = st.columns([2, 2, 3])
    auto = top[0].toggle("Auto-refresh every 2 s", value=False, key="twin_auto")
    couriers_only = top[1].toggle("Courier robots only (AMR)", value=True, key="twin_couriers")
    top[2].markdown(f'<div class="section-note" style="margin-top:8px">Polling <code>{twin_url}/api/robots</code> '
                    f'(Jorge\'s Node server, docs/API_CONTRACT.md §2).</div>', unsafe_allow_html=True)

    def battery_color(b):
        return GOOD if b >= 60 else (AMBER if b >= 30 else BAD)

    def render_twin():
        robots, err = D.fetch_robots(twin_url, timeout=2.0)
        if robots is None:
            st.markdown(kpi("Twin server", "Offline", f"{twin_url} isn't answering", "warn"), unsafe_allow_html=True)
            st.markdown("")
            st.info(
                "The 3D twin isn't running, so there's no live telemetry. The rest of the dashboard works "
                "without it.\n\n**To go live:** `cd digital_twin_app` → `npm install` → `npm start`, then open "
                "http://localhost:3000. For AnyLogic-driven robots, tick **enableTwinBridge** in the Simulation "
                "experiment and run it.", icon=":material/power_off:")
            st.caption(f"Connection detail: {err}")
            return
        df = D.fleet_frame(robots, couriers_only)
        alive = df[df["speed"].fillna(0) > 0] if not df.empty else df
        anylogic = "cargo" in df.columns or "slots" in df.columns
        kpi_row([
            kpi("Twin server", "Online", "AnyLogic-driven" if anylogic else "browser simulation"),
            kpi("Robots", f"{len(df)}", f"{len(alive)} moving", "alt"),
            kpi("Avg battery", f"{df['battery'].mean():.0f}%" if not df.empty else "—",
                f"lowest {df['battery'].min():.0f}%" if not df.empty else "", "alt"),
            kpi("Low battery (<30%)", f"{int((df['battery'] < 30).sum())}" if not df.empty else "0",
                "need charging", "warn"),
        ])
        st.markdown("")
        if df.empty:
            st.caption("The server answered, but there are no robots in this view.")
            return
        cols = st.columns(min(3, len(df)))
        for i, r in df.iterrows():
            b = float(r["battery"]) if pd.notna(r["battery"]) else 0.0
            slots = ""
            cargo_v, slots_v = r.get("cargo"), r.get("slots")
            if pd.notna(cargo_v) and pd.notna(slots_v):
                slots = f" · load {int(cargo_v)}/{int(slots_v)} slots"
            elif pd.notna(cargo_v):
                slots = f" · cargo {int(cargo_v)}"
            name = str(r.get("name") or "")
            cols[i % len(cols)].markdown(
                f'<div class="robot"><div class="rid">{r["id"]} <span style="color:{MUTED};font-weight:400">'
                f'{name}</span></div><div class="rstatus">{r.get("status", "")}{slots}</div>'
                f'<div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-top:4px">'
                f'<span>Battery {b:.0f}%</span><span>{float(r["speed"] or 0):.2f} m/s</span></div>'
                f'<div class="bar"><div style="width:{max(0, min(100, b)):.0f}%;background:{battery_color(b)}">'
                f'</div></div></div>', unsafe_allow_html=True)
        a, b_ = st.columns([3, 2])
        with a:
            fig = go.Figure(go.Scatter(
                x=df["x"], y=df["z"], mode="markers+text", text=df["id"], textposition="top center",
                marker=dict(size=16, color=df["battery"], colorscale=[[0, BAD], [0.3, AMBER], [0.6, GOOD], [1, GOOD]],
                            cmin=0, cmax=100, line=dict(color=SURFACE, width=2), colorbar=dict(title="Battery %")),
                customdata=df[["status", "battery"]],
                hovertemplate="%{text}<br>%{customdata[0]}<br>battery %{customdata[1]:.0f}%<extra></extra>"))
            fig.update_layout(xaxis=dict(title="x (twin units)"),
                              yaxis=dict(title="z (twin units)", scaleanchor="x", scaleratio=1, autorange="reversed"))
            chart(style_fig(fig, 380, "Fleet positions (top view)", legend=False), "twin_map")
        with b_:
            fig = go.Figure(go.Bar(x=df["battery"], y=df["id"], orientation="h",
                                   marker_color=[battery_color(v) for v in df["battery"].fillna(0)],
                                   text=[f"{v:.0f}%" for v in df["battery"].fillna(0)], textposition="outside",
                                   cliponaxis=False, hovertemplate="%{y}: %{x:.0f}%<extra></extra>"))
            fig.update_layout(xaxis=dict(title="Battery %", range=[0, 110]), yaxis=dict(autorange="reversed"))
            chart(style_fig(fig, 380, "Battery by robot", legend=False), "twin_batt")
        show = [c for c in ["id", "name", "type", "status", "battery", "speed", "cargo", "slots", "x", "z"]
                if c in df.columns]
        table(df[show].round(2))
        st.caption(f"Updated {pd.Timestamp.now().strftime('%H:%M:%S')}")

    if auto:
        st.fragment(run_every=2)(render_twin)()
    else:
        render_twin()
        st.button("Refresh now", key="twin_refresh")

# ==================================================================================================
# Tab 5 — Executive Report
# ==================================================================================================
with tab_exec:
    section("05", "Executive summary")
    st.markdown(
        "Miami Dade College North Campus receives mail from USPS, Amazon, UPS, FedEx and newspaper vendors at the "
        "**Duplicating & Mail Center (Building 3)**. Three clerks sort it, and today staff walk it to offices. We "
        "built a **multi-method digital twin**: a discrete-event model of the mailroom, an agent-based model of "
        "courier robots and students crowding the walkways at every class change, reinforcement-learning dispatch "
        "policies, and a live 3D view. The model is **calibrated** against the real 4-minute (quiet) and "
        "7-minute (class change) walk from Building 3 to Building 1.")
    if not final_data:
        st.caption("The findings below are computed live from the files currently loaded (sample exports before "
                   "calibration). They update automatically when the final CSVs are added.")

    insights = D.build_insights(opt, compare, mc, sens, calib, rl_table)
    sub("Key findings")
    if not insights:
        st.info("No results loaded yet.")
    cols = st.columns(2)
    for i, ins in enumerate(insights):
        body = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", ins["body"])
        cols[i % 2].markdown(f'<div class="insight"><div class="tag">{ins["tag"]}</div><h4>{ins["title"]}</h4>'
                             f'{body}</div>', unsafe_allow_html=True)

    sub("What did the model reveal that wasn't obvious?")
    st.markdown(
        "- **More robots isn't better.** Beyond a small fleet, extra robots add cost without improving same-day "
        "service in the Optimization runs: mail arrives in a few vendor drops a day, so extra robots mostly wait.\n"
        "- **The fastest policy is the most wasteful.** Dispatching immediately minimises hours-to-locker but "
        "drives the most kilometres and drains the batteries; batching and learned policies give up minutes, not "
        "same-day service.\n"
        "- **Batteries are the hidden constraint.** The RL agents learned to keep charge in reserve: PPO ends the "
        "day with about twice the battery of FIFO at the same service level.\n"
        "- **Class changes matter.** Students on the walkways stretch a 4-minute trip to 7 minutes, so *when* a "
        "robot leaves matters as much as *how full* it is.")

    sub("Which policies improve the system?")
    st.markdown(
        "1. **Right-size the fleet** using the Optimization result above, and keep 2 charging pads.\n"
        "2. **Dispatch with a learned policy (PPO)** for the best balance of reward, service and battery health; "
        "Q-learning is a strong, explainable alternative that can run inside AnyLogic today.\n"
        "3. **Avoid dispatching into class changes** where possible; the crowd slow-down is calibrated at "
        "0.449 per student.\n"
        "4. **Plan for growth:** the Sensitivity runs show how much distance and cost each extra 10 Amazon "
        "packages per day adds.")

    sub("System architecture")
    st.graphviz_chart(
        f"""
digraph G {{
  rankdir=LR; bgcolor="transparent"; pad=0.2; nodesep=0.35; ranksep=0.6;
  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=13, color="{P['node_line']}",
        fillcolor="{P['node_fill']}", fontcolor="{INK}", margin="0.18,0.10"];
  edge [color="{MUTED}", fontname="Helvetica", fontsize=10, fontcolor="{MUTED}"];
  data [label="Real campus data\\nMDC directory · vendor times\\nobserved 4 / 7 min walk", color="{AMBER}"];
  anylogic [label="AnyLogic 8.9 model\\nDES mailroom (3 clerks)\\nABM robots + students\\n5 experiments",
            color="{MDC_BLUE}", penwidth=2];
  rl [label="RL training (Python)\\nGymnasium env\\nQ-learning · PPO (SB3)", color="{TEAL}", penwidth=2];
  twin [label="3D digital twin\\nNode.js + Three.js\\nport 3000"];
  csv [label="CSV exports\\nanylogic_model/exports", shape=folder];
  json [label="RL results JSON\\nrl_models/*.json", shape=folder];
  dash [label="Streamlit dashboard\\nport 8501", fillcolor="{MDC_BLUE}", fontcolor="white", color="{MDC_NAVY}"];
  data -> anylogic [label="calibration"];
  anylogic -> csv [label="every run"];
  anylogic -> twin [label="POST /api/anylogic/update"];
  twin -> anylogic [label="speed", style=dashed];
  rl -> json;
  rl -> anylogic [label="q_table.csv · ppo_policy.json", style=dashed];
  csv -> dash; json -> dash;
  twin -> dash [label="GET /api/robots"];
}}
""",
        width="stretch",
    )

    with st.expander("Data provenance: every file this dashboard reads"):
        a, b = st.columns(2)
        with a:
            st.markdown(f"**AnyLogic exports** · `{exports_dir}`")
            table(D.file_inventory(exports_dir, D.EXPORT_FILES))
        with b:
            st.markdown(f"**RL results** · `{rl_dir}`")
            table(D.file_inventory(rl_dir, D.RL_FILES))

st.markdown(
    '<div class="foot">'
    "CAI 4830C Simulation for Applied AI · Miami Dade College · Team: Jorge A Mendoza (3D twin), "
    "Jordan Gonzalez (RL), Illia Shybanov (dashboard), Ricardo Molina Gonzalez (AnyLogic model)</div>",
    unsafe_allow_html=True,
)
