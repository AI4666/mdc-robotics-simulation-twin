"""
Visual skins for the dashboard. All three use the same MDC palette (MDC blue #0B4DA2, navy #0A2A5E, plus teal,
amber and rust accents) and the same page structure; only typography, surfaces and decoration change.

Pick one with the DASHBOARD_STYLE env var (editorial | control | blueprint). The Streamlit theme for each skin
(light/dark base, fonts, radius) lives in THEMES; `python styles.py <skin>` prints it as a .streamlit/config.toml
[theme] block, and `python styles.py <skin> --flags` prints the matching `streamlit run` flags.
"""

from __future__ import annotations

import os
import sys

DEFAULT_STYLE = "blueprint"

FONTS = {
    "editorial": "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..700"
                 "&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
    "control": "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Manrope:wght@400;500;600;700"
               "&family=JetBrains+Mono:wght@400;500;700&display=swap",
    "blueprint": "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900"
                 "&family=Atkinson+Hyperlegible:wght@400;700&family=DM+Mono:wght@400;500&display=swap",
}

# Everything Python-side (Plotly, Graphviz, inline HTML) reads its colours from here.
PALETTES = {
    "editorial": dict(
        name="Campus Editorial", dark=False,
        blue="#0B4DA2", navy="#0A2A5E", teal="#1A9E8F", amber="#D98E2B", rust="#B7410E", slate="#8C8577",
        ink="#14213D", muted="#666E7A", grid="#E4DED2", surface="#FAF8F3", fill="#C9D8EE",
        good="#2F7D4F", bad="#B42318",
        display="Fraunces, Georgia, serif", body="'IBM Plex Sans', 'Segoe UI', sans-serif",
        mono="'IBM Plex Mono', Consolas, monospace", template="plotly_white",
        node_fill="#F3EFE6", node_line="#D4CCBB",
    ),
    "control": dict(
        name="Mission Control", dark=True,
        blue="#4C8DF6", navy="#0A2A5E", teal="#2BC4B0", amber="#F2B544", rust="#F2704B", slate="#7F93B5",
        ink="#E6EEFA", muted="#8FA3C4", grid="#1C3566", surface="#0B1F45", fill="#24518F",
        good="#34D399", bad="#F87171",
        display="'Chakra Petch', 'Segoe UI', sans-serif", body="Manrope, 'Segoe UI', sans-serif",
        mono="'JetBrains Mono', Consolas, monospace", template="plotly_dark",
        node_fill="#0E2652", node_line="#2A4C86",
    ),
    "blueprint": dict(
        name="Blueprint", dark=False,
        blue="#0B4DA2", navy="#0A2A5E", teal="#11897B", amber="#E09A2D", rust="#C2410C", slate="#8A96A8",
        ink="#0A2A5E", muted="#5A6B86", grid="#DCE5F2", surface="#FFFFFF", fill="#BFD3EE",
        good="#15803D", bad="#B91C1C",
        display="Archivo, 'Arial Narrow', sans-serif", body="'Atkinson Hyperlegible', 'Segoe UI', sans-serif",
        mono="'DM Mono', Consolas, monospace", template="plotly_white",
        node_fill="#F2F6FC", node_line="#9FB6D8",
    ),
}

THEMES = {
    "editorial": {
        "base": "light", "primaryColor": "#0B4DA2", "backgroundColor": "#FAF8F3",
        "secondaryBackgroundColor": "#F1EDE4", "textColor": "#14213D", "borderColor": "#DDD6C8",
        "baseRadius": "0.25rem", "font": "'IBM Plex Sans', sans-serif", "headingFont": "Fraunces, serif",
        "codeFont": "'IBM Plex Mono', monospace", "showWidgetBorder": True,
    },
    "control": {
        "base": "dark", "primaryColor": "#4C8DF6", "backgroundColor": "#06142E",
        "secondaryBackgroundColor": "#0E2652", "textColor": "#E6EEFA", "borderColor": "#1C3566",
        "baseRadius": "0.5rem", "font": "Manrope, sans-serif", "headingFont": "'Chakra Petch', sans-serif",
        "codeFont": "'JetBrains Mono', monospace", "showWidgetBorder": True,
    },
    "blueprint": {
        "base": "light", "primaryColor": "#0B4DA2", "backgroundColor": "#FFFFFF",
        "secondaryBackgroundColor": "#F2F6FC", "textColor": "#0A2A5E", "borderColor": "#C8D6EA",
        "baseRadius": "0rem", "font": "'Atkinson Hyperlegible', sans-serif", "headingFont": "Archivo, sans-serif",
        "codeFont": "'DM Mono', monospace", "showWidgetBorder": True,
    },
}


def current() -> str:
    key = os.environ.get("DASHBOARD_STYLE", DEFAULT_STYLE).strip().lower()
    return key if key in PALETTES else DEFAULT_STYLE


def palette(key: str | None = None) -> dict:
    return PALETTES[key or current()]


# --------------------------------------------------------------------------------------------------
# CSS: one shared structure driven by variables, then a few skin-specific touches
# --------------------------------------------------------------------------------------------------
_BASE = """
@import url('{fonts}');
:root {{
  --blue: {blue}; --navy: {navy}; --teal: {teal}; --amber: {amber}; --rust: {rust};
  --ink: {ink}; --muted: {muted}; --rule: {grid}; --surface: {surface};
  --f-display: {display}; --f-body: {body}; --f-mono: {mono};
}}
html, body, .stApp, .stApp p, .stApp li, .stApp label, .stApp input, .stApp textarea, .stApp button,
.stApp [data-testid="stMarkdownContainer"], .stApp [data-testid="stCaptionContainer"] {{ font-family: var(--f-body); }}
.stApp h1, .stApp h2, .stApp h3, .stApp h4, .stApp h5 {{ font-family: var(--f-display); color: var(--ink); }}
.stApp code {{ font-family: var(--f-mono); }}
header[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 2.2rem; padding-bottom: 3rem; max-width: 1380px; }}
[data-testid="stMetricValue"] {{ font-family: var(--f-mono); font-variant-numeric: tabular-nums; }}
[data-testid="stMetricLabel"] p {{ font-family: var(--f-mono); font-size: 0.74rem; letter-spacing: .06em;
  text-transform: uppercase; color: var(--muted); }}

/* brand block in the sidebar */
.brand {{ display: flex; align-items: center; gap: 12px; margin: 2px 0 18px 0; }}
.brand-mark {{ font-family: var(--f-display); font-weight: 800; font-size: .92rem; letter-spacing: .04em;
  color: #fff; background: var(--blue); padding: 8px 9px; line-height: 1; }}
.brand b {{ display: block; font-family: var(--f-display); font-size: 1.08rem; color: var(--ink); }}
.brand small {{ color: var(--muted); font-size: .78rem; }}
.side-label {{ font-family: var(--f-mono); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); margin: 14px 0 6px 0; }}

/* masthead */
.mast {{ position: relative; margin-bottom: 20px; }}
.mast .eyebrow {{ font-family: var(--f-mono); font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; }}
.mast h1 {{ margin: 6px 0 6px 0; line-height: 1.05; }}
.mast p {{ margin: 0; max-width: 820px; }}
.mast .facts {{ display: flex; flex-wrap: wrap; margin-top: 16px; }}
.mast .fact {{ padding: 2px 18px 2px 0; margin-right: 18px; }}
.mast .fact b {{ display: block; font-family: var(--f-mono); font-size: 1.05rem; font-variant-numeric: tabular-nums; }}
.mast .fact span {{ font-size: .74rem; letter-spacing: .05em; text-transform: uppercase; }}

/* section headings */
.sec {{ display: flex; align-items: baseline; gap: 14px; margin: 6px 0 4px 0; }}
.sec .num {{ font-family: var(--f-mono); font-size: .8rem; color: var(--blue); letter-spacing: .08em; }}
.sec h2 {{ margin: 0; padding: 0; font-size: 1.55rem; }}
.section-note {{ color: var(--muted); font-size: .92rem; margin: 2px 0 14px 0; max-width: 900px; }}
.subhead {{ font-family: var(--f-display); font-size: 1.12rem; font-weight: 600; color: var(--ink);
  margin: 22px 0 6px 0; }}

/* KPI tiles */
.kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 16px; margin-bottom: 8px; }}
.kpi {{ height: 100%; min-height: 124px; padding: 14px 16px 12px 16px; }}
.kpi .label {{ font-family: var(--f-mono); color: var(--muted); font-size: .7rem; letter-spacing: .1em;
  text-transform: uppercase; }}
.kpi .value {{ font-family: var(--f-display); color: var(--ink); font-size: 1.7rem; line-height: 1.2;
  margin-top: 6px; font-variant-numeric: tabular-nums; }}
.kpi .sub {{ color: var(--muted); font-size: .8rem; margin-top: 4px; font-family: var(--f-body); font-weight: 400; }}
.kpi .up {{ color: {good}; font-weight: 600; }} .kpi .down {{ color: {bad}; font-weight: 600; }}

/* findings, robots */
.insight {{ padding: 16px 18px; margin-bottom: 14px; }}
.insight .tag {{ font-family: var(--f-mono); color: var(--blue); font-size: .7rem; letter-spacing: .12em;
  text-transform: uppercase; }}
.insight h4 {{ margin: 4px 0 8px 0; font-size: 1.12rem; }}
.robot {{ padding: 12px 14px; margin-bottom: 10px; }}
.robot .rid {{ font-family: var(--f-mono); font-weight: 600; color: var(--ink); }}
.robot .rstatus {{ color: var(--muted); font-size: .84rem; min-height: 2.2em; }}
.bar {{ height: 6px; overflow: hidden; margin-top: 6px; background: var(--rule); }}
.bar > div {{ height: 6px; }}
.foot {{ color: var(--muted); font-size: .78rem; margin-top: 30px; border-top: 1px solid var(--rule); padding-top: 10px; }}

/* tabs */
.stTabs [role="tablist"] {{ gap: 4px; }}
.stTabs [role="tab"] p {{ font-family: var(--f-body); font-weight: 600; }}
"""

_SKINS = {
    # ------------------------------------------------------------------ Campus Editorial: printed annual report
    "editorial": """
.stApp {{ background: #FAF8F3; }}
section[data-testid="stSidebar"] {{ background: #F1EDE4; border-right: 1px solid var(--rule); }}
.mast {{ border-top: 3px double var(--ink); border-bottom: 1px solid var(--ink); padding: 18px 0 20px 0; }}
.mast .eyebrow {{ color: var(--blue); }}
.mast h1 {{ font-family: var(--f-display); font-weight: 700; font-size: 2.7rem; color: var(--navy);
  font-variation-settings: "opsz" 144; letter-spacing: -0.02em; }}
.mast p {{ font-family: var(--f-display); font-style: italic; font-size: 1.12rem; color: #3D4657; }}
.mast .fact {{ border-right: 1px solid var(--rule); }}
.mast .fact:last-child {{ border-right: 0; }}
.mast .fact b {{ color: var(--navy); }} .mast .fact span {{ color: var(--muted); }}
.sec {{ border-bottom: 1px solid var(--rule); padding-bottom: 8px; }}
.sec .num {{ font-family: var(--f-display); font-style: italic; font-size: 1.3rem; }}
.sec h2 {{ font-weight: 600; font-size: 1.75rem; letter-spacing: -0.01em; }}
.kpi {{ border-top: 2px solid var(--ink); padding-left: 0; padding-right: 8px; background: transparent; }}
.kpi.alt {{ border-top-color: var(--teal); }} .kpi.warn {{ border-top-color: var(--amber); }}
.kpi .value {{ font-weight: 600; font-size: 2.1rem; color: var(--navy); }}
.insight {{ background: transparent; border-left: 3px solid var(--blue); padding-left: 18px; }}
.insight h4 {{ font-weight: 600; font-size: 1.22rem; }}
.robot {{ border-top: 2px solid var(--ink); padding-left: 0; }}
.stTabs [role="tablist"] {{ border-bottom: 1px solid var(--ink); }}
.stTabs [role="tab"] {{ padding: 8px 10px 8px 0; margin-right: 6px; }}
.stTabs [role="tab"] p {{ font-family: var(--f-mono); font-size: .74rem; text-transform: uppercase;
  letter-spacing: .05em; font-weight: 500; }}
.stTabs [role="tab"] [data-testid="stIconMaterial"] {{ display: none; }}
[data-testid="stVerticalBlockBorderWrapper"]:has(> div > [data-testid="stVerticalBlock"]) {{ border-color: var(--rule); }}
""",
    # ------------------------------------------------------------------ Mission Control: dark operations console
    "control": """
.stApp {{ background:
  radial-gradient(circle at 1px 1px, rgba(76,141,246,0.13) 1px, transparent 0) 0 0 / 22px 22px,
  radial-gradient(1200px 500px at 85% -10%, rgba(11,77,162,0.45), transparent 60%), #06142E; }}
section[data-testid="stSidebar"] {{ background: #081A3C; border-right: 1px solid var(--rule); }}
.brand-mark {{ background: transparent; color: var(--blue); border: 1px solid var(--blue); }}
.mast {{ background: linear-gradient(90deg, rgba(14,38,82,0.95), rgba(14,38,82,0.55)); border: 1px solid var(--rule);
  border-left: 3px solid var(--blue); padding: 18px 22px; border-radius: 8px; }}
.mast .eyebrow {{ color: var(--teal); }}
.mast .eyebrow::before {{ content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--teal); margin-right: 8px; box-shadow: 0 0 0 0 rgba(43,196,176,.7); animation: pulse 2s infinite; }}
@keyframes pulse {{ 0% {{ box-shadow: 0 0 0 0 rgba(43,196,176,.6); }} 70% {{ box-shadow: 0 0 0 9px rgba(43,196,176,0); }}
  100% {{ box-shadow: 0 0 0 0 rgba(43,196,176,0); }} }}
.mast h1 {{ font-family: var(--f-display); text-transform: uppercase; letter-spacing: .06em; font-size: 2rem;
  font-weight: 700; color: #fff; }}
.mast p {{ color: var(--muted); }}
.mast .fact {{ border-left: 1px solid var(--rule); padding-left: 14px; }}
.mast .fact b {{ color: #fff; }} .mast .fact span {{ color: var(--muted); }}
.sec h2 {{ text-transform: uppercase; letter-spacing: .05em; font-size: 1.35rem; }}
.sec .num {{ color: var(--teal); }}
.subhead {{ text-transform: uppercase; letter-spacing: .05em; font-size: .98rem; }}
.kpi {{ position: relative; background: rgba(14,38,82,0.75); border: 1px solid var(--rule); border-radius: 8px; }}
.kpi::before, .kpi::after {{ content: ""; position: absolute; width: 10px; height: 10px; border-color: var(--blue);
  border-style: solid; }}
.kpi::before {{ top: -1px; left: -1px; border-width: 2px 0 0 2px; border-top-left-radius: 8px; }}
.kpi::after {{ bottom: -1px; right: -1px; border-width: 0 2px 2px 0; border-bottom-right-radius: 8px; }}
.kpi.alt::before, .kpi.alt::after {{ border-color: var(--teal); }}
.kpi.warn::before, .kpi.warn::after {{ border-color: var(--amber); }}
.kpi .value {{ font-family: var(--f-mono); font-weight: 600; color: #fff; font-size: 1.6rem; }}
.insight {{ background: rgba(14,38,82,0.7); border: 1px solid var(--rule); border-left: 3px solid var(--teal);
  border-radius: 8px; }}
.insight .tag {{ color: var(--teal); }}
.robot {{ background: rgba(14,38,82,0.75); border: 1px solid var(--rule); border-radius: 8px; }}
.bar {{ border-radius: 3px; }} .bar > div {{ border-radius: 3px; box-shadow: 0 0 10px currentColor; }}
.stTabs [role="tablist"] {{ background: rgba(14,38,82,0.6); border: 1px solid var(--rule); border-radius: 10px;
  padding: 4px; width: fit-content; }}
.stTabs [role="tab"] {{ border-radius: 7px; padding: 6px 14px; }}
.stTabs [role="tab"][aria-selected="true"] {{ background: var(--blue); }}
.stTabs [role="tab"][aria-selected="true"] p, .stTabs [role="tab"][aria-selected="true"] span {{ color: #fff; }}
.stTabs [data-baseweb="tab-highlight"], .stTabs [data-baseweb="tab-border"] {{ display: none; }}
""",
    # ------------------------------------------------------------------ Blueprint: engineering drawing
    "blueprint": """
.stApp {{ background:
  linear-gradient(rgba(11,77,162,0.06) 1px, transparent 1px) 0 0 / 24px 24px,
  linear-gradient(90deg, rgba(11,77,162,0.06) 1px, transparent 1px) 0 0 / 24px 24px, #FFFFFF; }}
section[data-testid="stSidebar"] {{ background: #F2F6FC; border-right: 2px solid var(--navy); }}
.brand-mark {{ background: var(--navy); }}
.mast {{ background: var(--blue); color: #fff; padding: 22px 26px 20px 26px; overflow: hidden;
  border: 2px solid var(--navy); }}
.mast::after {{ content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 34%;
  background: repeating-linear-gradient(-45deg, rgba(255,255,255,0.10) 0 2px, transparent 2px 12px); }}
.mast > * {{ position: relative; z-index: 1; }}
.mast .eyebrow {{ color: #CFE0FA; }}
.mast h1 {{ font-family: var(--f-display); font-stretch: 112%; font-weight: 850; font-size: 2.4rem; color: #fff;
  text-transform: uppercase; letter-spacing: -0.01em; font-variation-settings: "wdth" 112; }}
.mast p {{ color: #DCE7F7; }}
.mast .fact {{ border-left: 2px solid rgba(255,255,255,0.45); padding-left: 12px; }}
.mast .fact b {{ color: #fff; }} .mast .fact span {{ color: #CFE0FA; }}
.sec h2 {{ font-weight: 800; text-transform: uppercase; font-size: 1.5rem; font-variation-settings: "wdth" 112; }}
.sec .num {{ background: var(--navy); color: #fff; padding: 3px 7px; font-size: .75rem; }}
.subhead {{ font-weight: 800; text-transform: uppercase; font-size: .98rem; letter-spacing: .02em;
  font-variation-settings: "wdth" 112; }}
.kpi {{ background: #fff; border: 1.5px solid var(--navy); box-shadow: 4px 4px 0 var(--blue); }}
.kpi.alt {{ box-shadow: 4px 4px 0 var(--teal); }} .kpi.warn {{ box-shadow: 4px 4px 0 var(--amber); }}
.kpi .value {{ font-weight: 800; font-size: 1.75rem; font-variation-settings: "wdth" 112; }}
.insight {{ background: #fff; border: 1.5px solid var(--navy); box-shadow: 4px 4px 0 var(--fill-shadow, #BFD3EE); }}
.robot {{ background: #fff; border: 1.5px solid var(--navy); }}
.stTabs [role="tablist"] {{ border-bottom: 2px solid var(--navy); gap: 0; }}
.stTabs [role="tab"] {{ border: 1.5px solid var(--navy); border-bottom: 0; padding: 8px 16px; margin-right: -1.5px;
  background: #fff; }}
.stTabs [role="tab"][aria-selected="true"] {{ background: var(--navy); }}
.stTabs [role="tab"][aria-selected="true"] p, .stTabs [role="tab"][aria-selected="true"] span {{ color: #fff; }}
.stTabs [data-baseweb="tab-highlight"] {{ display: none; }}
""",
}


def css(key: str | None = None) -> str:
    key = key or current()
    p = PALETTES[key]
    body = _BASE.format(fonts=FONTS[key], **p) + _SKINS[key].format(**p)
    return f"<style>{body}</style>"


# --------------------------------------------------------------------------------------------------
# Theme export helpers
# --------------------------------------------------------------------------------------------------
def _toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return '"' + str(v).replace('"', '\\"') + '"'


def theme_toml(key: str) -> str:
    return "[theme]\n" + "\n".join(f"{k} = {_toml_value(v)}" for k, v in THEMES[key].items()) + "\n"


def theme_flags(key: str) -> list[str]:
    return [f"--theme.{k}={str(v).lower() if isinstance(v, bool) else v}" for k, v in THEMES[key].items()]


if __name__ == "__main__":
    skin = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_STYLE
    if "--flags" in sys.argv:
        print("\n".join(theme_flags(skin)))
    else:
        print(theme_toml(skin))
