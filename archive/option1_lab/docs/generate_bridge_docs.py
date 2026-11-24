"""Generate the Cross-Repository Integration & Live Bridge Guide PDF and HTML.
Explains how AnyLogic (.alp), AI-3D-Robotics-Lab (Node.js/Three.js), and mdc-robotics-simulation-twin
(Python RL & Streamlit) connect, exchange data, and test end-to-end.
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cross-Repository Integration & Live Bridge Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    themeVariables: {
      primaryColor: '#e0f2fe',
      primaryTextColor: '#0369a1',
      primaryBorderColor: '#38bdf8',
      lineColor: '#0284c7',
      secondaryColor: '#f0fdf4',
      tertiaryColor: '#fef3c7'
    }
  });
</script>
<style>
  @page {
    size: letter;
    margin: 16mm 14mm 16mm 14mm;
    @bottom-center {
      content: "MDC Simulation • Cross-Repository Live Bridge Guide • Page " counter(page) " of " counter(pages);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.55;
    color: #1e293b;
    background-color: #ffffff;
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 20px;
  }

  header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    font-size: 0.78rem;
    font-weight: 700;
    border-radius: 9999px;
    background: #e0f2fe;
    color: #0369a1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
  }

  h1 { font-size: 1.85rem; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; }
  .subtitle { font-size: 1.0rem; color: #475569; margin: 0 0 14px 0; }

  .meta-box {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .meta-item strong { display: block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; }
  .meta-item span { font-size: 0.88rem; font-weight: 600; color: #0f172a; }

  h2 {
    font-size: 1.35rem; font-weight: 700; color: #0369a1;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;
    margin-top: 26px; margin-bottom: 12px; break-after: avoid;
  }
  h3 { font-size: 1.08rem; font-weight: 600; color: #0f172a; margin-top: 18px; margin-bottom: 8px; break-after: avoid; }
  p { margin: 0 0 10px 0; color: #334155; font-size: 0.92rem; }

  table { width: 100%; border-collapse: collapse; margin: 12px 0 18px 0; font-size: 0.85rem; break-inside: avoid; }
  th { background: #f1f5f9; color: #0f172a; font-weight: 600; text-align: left; padding: 7px 9px; border: 1px solid #cbd5e1; }
  td { padding: 7px 9px; border: 1px solid #e2e8f0; vertical-align: top; }
  tr:nth-child(even) { background-color: #f8fafc; }

  .diagram-container {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 14px; margin: 14px 0; text-align: center; break-inside: avoid;
  }
  .diagram-title { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }

  .callout {
    border-left: 4px solid #0284c7; background: #f0f9ff;
    padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 12px 0; font-size: 0.9rem; break-inside: avoid;
  }
  .callout-success { border-left-color: #10b981; background: #ecfdf5; }

  code { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.85em; background: #f1f5f9; color: #0369a1; padding: 2px 5px; border-radius: 3px; }
  pre {
    background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px;
    font-family: 'JetBrains Mono', Consolas, monospace; font-size: 0.80rem; overflow-x: auto; margin: 10px 0;
  }
  ul, ol { margin: 0 0 12px 0; padding-left: 20px; font-size: 0.92rem; }
  li { margin-bottom: 4px; }
</style>
</head>
<body>

<header>
  <span class="badge">Technical Guide for Team</span>
  <h1>Cross-Repository Integration & Live Bridge Guide</h1>
  <p class="subtitle">How AnyLogic (.alp), AI-3D-Robotics-Lab (Three.js/Node), and mdc-robotics-simulation-twin (Python/Streamlit) Communicate in Real-Time</p>
  
  <div class="meta-box">
    <div class="meta-item"><strong>Primary Engine</strong><span>AnyLogic 8 (Java)</span></div>
    <div class="meta-item"><strong>3D Digital Twin</strong><span>Node.js Express + Three.js (Port 3000)</span></div>
    <div class="meta-item"><strong>AI & Dashboard</strong><span>Python Gym + Streamlit (Port 8501)</span></div>
    <div class="meta-item"><strong>Team</strong><span>Jorge, Jordan, Illia, Ricardo</span></div>
  </div>
</header>

<section>
  <h2>1. The Big Picture: Three Systems, One Unified Ecosystem</h2>
  <p>
    Our group project seamlessly connects three specialized platforms so that each team member's component communicates with the others without friction:
  </p>

  <div class="diagram-container">
    <div class="diagram-title">System Interconnection & Communication Flow</div>
    <div class="mermaid">
sequenceDiagram
    autonumber
    actor User as User / Professor
    participant UI as Streamlit Dashboard (Port 8501)
    participant AL as AnyLogic Simulation (.alp)
    participant RL as Python RL Supervisor (Gymnasium)
    participant Twin as 3D Digital Twin Server (Port 3000)
    participant WebGL as Browser 3D Classroom (Three.js)

    User->>UI: Adjust Sliders (Fleet Size, Arrival Rates, Policy)
    RL->>AL: Export Trained Policy Rules (Q-Learning vs PPO)
    AL->>AL: Execute DES Queues & Agent Statecharts
    loop Every 1 Simulated Second
        AL->>Twin: HTTP POST /api/anylogic/update (Robots X,Y & Battery)
        Twin->>WebGL: WebSocket Broadcast (ROBOT_UPDATE)
        WebGL->>User: 3D Animation Updates Live in Browser!
    end
    AL->>UI: Stream Telemetry & Experiment Logs (CSV/JSON)
    RL->>UI: Stream Training Curves & Reward Benchmarks
    UI->>User: Displays Real-Time KPIs, Charts & Executive Report
    </div>
  </div>
</section>

<section>
  <h2>2. How AnyLogic Talks to the 3D Digital Twin (Channel 1)</h2>
  <div class="callout callout-success">
    <strong>Key Fact:</strong> The backend receiver is ALREADY BUILT in our <code>AI-3D-Robotics-Lab</code> repository!
  </div>
  <p>
    Inside <code>AI-3D-Robotics-Lab/digital_twin_app/server.js</code> (lines 58–66), we already have the dedicated endpoint:
  </p>
  <pre>app.post('/api/anylogic/update', (req, res) => {
  const { robots, source } = req.body;
  if (Array.isArray(robots)) {
    world.mergeRobots(robots);
    broadcast('ROBOT_UPDATE', { robots: world.getRobots(), source: source || 'AnyLogic' });
  }
  res.json({ success: true, count: world.getRobots().length });
});</pre>

  <h3>The AnyLogic Transmitter Code (Java):</h3>
  <p>
    In AnyLogic, inside a periodic <strong>Event</strong> block (set to repeat every 1.0 simulated second), Jorge drops this native Java code:
  </p>
  <pre>// Native Java inside AnyLogic Model
String json = String.format(
    "{\\"source\\":\\"AnyLogic\\",\\"robots\\":[{\\"id\\":\\"amr01\\",\\"x\\":%.2f,\\"y\\":%.2f,\\"status\\":\\"%s\\",\\"battery\\":%d}]}",
    rover1.getX(), rover1.getY(), rover1.state, (int)(rover1.batteryLevel * 100)
);

java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
    .uri(java.net.URI.create("http://localhost:3000/api/anylogic/update"))
    .header("Content-Type", "application/json")
    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(json))
    .build();

client.sendAsync(request, java.net.http.HttpResponse.BodyHandlers.discarding());</pre>

  <p>
    <strong>Result:</strong> When AnyLogic runs, it transmits coordinates asynchronously over HTTP. The Node server immediately broadcasts them over WebSockets to the Three.js 3D canvas, causing the 3D rovers in the web browser to mirror AnyLogic's movements!
  </p>
</section>

<section>
  <h2>3. How Reinforcement Learning Connects to AnyLogic & UI (Channel 2)</h2>
  <p>
    Jordan develops and trains the RL algorithms in Python inside <code>rl_models/</code>:
  </p>
  <ul>
    <li>
      <strong>The Training Cycle:</strong> <code>train_qlearning.py</code> and <code>train_ppo.py</code> interact with the custom environment <code>robotics_lab_env.py</code> to learn optimal dispatching, parcel batching, and opportunistic charging thresholds.
    </li>
    <li>
      <strong>Exporting to AnyLogic:</strong> The learned decision rules (e.g. state-action Q-table and PPO policy lookup) export as <code>q_table.npy</code> and JSON policy logic. AnyLogic reads these rules in Java during simulation runs to replace naive FIFO dispatching.
    </li>
    <li>
      <strong>Exporting to Streamlit:</strong> The training metrics automatically write to <code>q_learning_results.json</code> and <code>ppo_results.json</code>.
    </li>
  </ul>
</section>

<section>
  <h2>4. How AnyLogic & RL Feed the Streamlit Dashboard (Channel 3)</h2>
  <p>
    Illia's Streamlit dashboard (<code>dashboard/app.py</code>) acts as the executive control room:
  </p>
  <pre># Inside dashboard/app.py
# Loads Jordan's RL training outputs:
with open("../rl_models/q_learning_results.json") as f:
    q_data = json.load(f)
with open("../rl_models/ppo_results.json") as f:
    ppo_data = json.load(f)

# Renders dynamic Plotly comparison curves and KPI cards
st.plotly_chart(render_comparison(q_data, ppo_data))</pre>
  <p>
    When Ricardo executes the 5 AnyLogic experiments (Optimization, Monte Carlo, Sensitivity Analysis), the resulting data tables populate Tab 3 of the dashboard.
  </p>
</section>

<section>
  <h2>5. Step-by-Step 3-Terminal Launch & Testing Sequence</h2>
  <p>To run and demonstrate the entire ecosystem live, open three terminal windows:</p>

  <div class="callout callout-success">
    <strong>Terminal 1: Start the 3D Web Digital Twin Server (Port 3000)</strong>
    <pre>cd "D:\Miami Dade College\AI-3D-Robotics-Lab\digital_twin_app"
npm start
# Server listening at: http://localhost:3000</pre>
  </div>

  <div class="callout callout-success">
    <strong>Terminal 2: Launch the Streamlit Analytical Dashboard (Port 8501)</strong>
    <pre>cd "D:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\dashboard"
streamlit run app.py
# Dashboard listening at: http://localhost:8501</pre>
  </div>

  <div class="callout callout-success">
    <strong>Step 3: Run the AnyLogic Model (.alp)</strong>
    <p>
      Open <code>MDC_Robotics_Lab_Simulation.alp</code> in AnyLogic 8 and click <strong>Run</strong>. AnyLogic executes the DES queues, streams $(X,Y)$ positions to Port 3000, and updates the metrics on Port 8501!
    </p>
  </div>
</section>

<section>
  <h2>6. Summary of Team Responsibilities</h2>
  <table>
    <thead>
      <tr>
        <th>Team Member</th>
        <th>Primary Tech Stack</th>
        <th>What They Build & Deliver</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Jorge A Mendoza</strong></td>
        <td>AnyLogic 8 (Java)</td>
        <td>Builds the multi-method simulation model and sets up the HTTP live bridge to Port 3000.</td>
      </tr>
      <tr>
        <td><strong>Jordan Gonzalez</strong></td>
        <td>Python (Gymnasium, SB3)</td>
        <td>Builds the RL training loops and exports <code>q_learning_results.json</code> and <code>ppo_results.json</code>.</td>
      </tr>
      <tr>
        <td><strong>Illia Shybanov</strong></td>
        <td>Python (Streamlit, Plotly)</td>
        <td>Builds the 5-tab web dashboard and connects inputs/sliders to the simulation metrics.</td>
      </tr>
      <tr>
        <td><strong>Ricardo Molina Gonzalez</strong></td>
        <td>AnyLogic Experiments & Docs</td>
        <td>Runs the 5 AnyLogic experiments, compiles data, and drafts the technical report and slides.</td>
      </tr>
    </tbody>
  </table>
</section>

</body>
</html>
"""

def main():
    course_docs = Path(r"d:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\docs")
    twin_docs = Path(r"d:\Miami Dade College\AI-3D-Robotics-Lab\Docs")

    course_html = course_docs / "Cross_Repository_Integration_and_Live_Bridge_Guide.html"
    course_pdf = course_docs / "Cross_Repository_Integration_and_Live_Bridge_Guide.pdf"

    twin_html = twin_docs / "Cross_Repository_Integration_and_Live_Bridge_Guide.html"
    twin_pdf = twin_docs / "Cross_Repository_Integration_and_Live_Bridge_Guide.pdf"

    print("Writing HTML documentation...")
    course_html.write_text(HTML_CONTENT, encoding="utf-8")
    twin_html.write_text(HTML_CONTENT, encoding="utf-8")

    print("Rendering PDF with Microsoft Edge headless...")
    with tempfile.TemporaryDirectory() as tmp:
        profile_dir = Path(tmp) / "profile"
        subprocess.run([
            EDGE,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=9000",
            f"--user-data-dir={profile_dir}",
            f"--print-to-pdf={course_pdf}",
            course_html.as_uri()
        ], check=True)

        last = -1
        for _ in range(60):
            size = course_pdf.stat().st_size if course_pdf.exists() else -1
            if size > 0 and size == last:
                break
            last = size
            time.sleep(0.5)

    import shutil
    shutil.copy2(course_pdf, twin_pdf)

    print("Successfully generated:")
    print(f"Course Docs PDF: {course_pdf} ({course_pdf.stat().st_size} bytes)")
    print(f"Twin Docs PDF:   {twin_pdf} ({twin_pdf.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
