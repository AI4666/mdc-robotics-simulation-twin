"""Generate HTML and PDF documentation for the System Integration and Testing Architecture.
Explains how AI-3D-Robotics-Lab and mdc-robotics-simulation-twin connect and work together.
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
<title>System Integration & Testing Architecture - MDC AI & Robotics Lab</title>
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
    margin: 18mm 16mm 18mm 16mm;
    @bottom-center {
      content: "MDC Robotics Lab • System Integration & Testing Architecture • Page " counter(page) " of " counter(pages);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1e293b;
    background-color: #ffffff;
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  header {
    border-bottom: 2px solid #0284c7;
    padding-bottom: 20px;
    margin-bottom: 30px;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 9999px;
    background: #e0f2fe;
    color: #0369a1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }

  h1 {
    font-size: 2.0rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.25;
    margin: 0 0 10px 0;
  }

  .subtitle {
    font-size: 1.05rem;
    color: #475569;
    margin: 0 0 16px 0;
  }

  .meta-box {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    margin-top: 14px;
  }

  .meta-item strong {
    display: block;
    font-size: 0.72rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .meta-item span {
    font-size: 0.92rem;
    font-weight: 600;
    color: #0f172a;
  }

  h2 {
    font-size: 1.4rem;
    font-weight: 700;
    color: #0369a1;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    margin-top: 32px;
    margin-bottom: 14px;
    break-after: avoid;
  }

  h3 {
    font-size: 1.12rem;
    font-weight: 600;
    color: #0f172a;
    margin-top: 22px;
    margin-bottom: 10px;
    break-after: avoid;
  }

  p {
    margin: 0 0 12px 0;
    color: #334155;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 20px 0;
    font-size: 0.88rem;
    break-inside: avoid;
  }

  th {
    background: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
  }

  td {
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }

  tr:nth-child(even) {
    background-color: #f8fafc;
  }

  .diagram-container {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 18px;
    margin: 18px 0;
    text-align: center;
    break-inside: avoid;
  }

  .diagram-title {
    font-size: 0.82rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 10px;
    letter-spacing: 0.05em;
  }

  .callout {
    border-left: 4px solid #0284c7;
    background: #f0f9ff;
    padding: 12px 16px;
    border-radius: 0 8px 8px 0;
    margin: 16px 0;
    font-size: 0.92rem;
    break-inside: avoid;
  }

  .callout-success {
    border-left-color: #10b981;
    background: #ecfdf5;
  }

  code {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.85em;
    background: #f1f5f9;
    color: #0369a1;
    padding: 2px 6px;
    border-radius: 4px;
  }

  pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 14px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.85rem;
    overflow-x: auto;
    margin: 14px 0;
  }

  .step-box {
    border: 1px solid #e2e8f0;
    background: #ffffff;
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    break-inside: avoid;
  }

  .step-header {
    font-weight: 700;
    font-size: 1.0rem;
    color: #0284c7;
    margin-bottom: 6px;
  }
</style>
</head>
<body>

<header>
  <span class="badge">Technical Architecture & Testing Manual</span>
  <h1>System Integration & Testing Architecture</h1>
  <p class="subtitle">Cross-Repository Pipeline: Linking the 3D Digital Twin, AnyLogic Multi-Method Engine, RL Supervisors & Streamlit Dashboard</p>
  
  <div class="meta-box">
    <div class="meta-item">
      <strong>Primary Repositories</strong>
      <span>AI-3D-Robotics-Lab & mdc-robotics-simulation-twin</span>
    </div>
    <div class="meta-item">
      <strong>Course</strong>
      <span>Simulation for Applied AI (MDC)</span>
    </div>
    <div class="meta-item">
      <strong>Author & Lead</strong>
      <span>Jorge A Mendoza</span>
    </div>
    <div class="meta-item">
      <strong>Team Members</strong>
      <span>Jordan, Illia, Ricardo</span>
    </div>
  </div>
</header>

<section>
  <h2>1. Executive Integration Overview</h2>
  <p>
    The system architecture separates the project cleanly into two complementary tiers:
  </p>
  <ul>
    <li><strong>Physical & Spatial Tier (<code>AI-3D-Robotics-Lab</code>):</strong> Hosts the Three.js 3D classroom CAD environment, 360&deg; rotating LiDAR obstacle sensors, draggable laboratory stations (A through E), and the Node.js WebSocket/HTTP bridge.</li>
    <li><strong>Analytical & Simulation Tier (<code>mdc-robotics-simulation-twin</code>):</strong> Hosts the course deliverables including the AnyLogic multi-method model (DES queueing + ABM statecharts), the Python Reinforcement Learning dispatch policies (Q-Learning vs. PPO), and the multi-tab Streamlit dashboard.</li>
  </ul>

  <div class="diagram-container">
    <div class="diagram-title">Full Cross-Repository Integration Pipeline</div>
    <div class="mermaid">
flowchart TB
    subgraph Repo1["Repository 1: AI-3D-Robotics-Lab (The Physical Environment)"]
        ThreeJS["Three.js 3D Interactive Classroom<br>(Stations A-E, Floorplan, Obstacles)"]
        Server["Node.js Express / WebSocket Server<br>(Port 3000: /api/anylogic/update)"]
        Fleet3D["Heterogeneous 3D Fleet<br>(3 AMRs, G1 Humanoid, Drone)"]
        ThreeJS <--> Server
        Fleet3D <--> ThreeJS
    end

    subgraph Repo2["Repository 2: mdc-robotics-simulation-twin (The Course Engine)"]
        AnyLogic["AnyLogic 8 Model (.alp)<br>• DES Student Queues<br>• ABM Robot Statecharts<br>• Native 3D Animation"]
        GymEnv["Python Gymnasium Environment<br>(robotics_lab_env.py)"]
        RL["Reinforcement Learning Supervisors<br>• Q-Learning (train_qlearning.py)<br>• PPO Actor-Critic (train_ppo.py)"]
        Dashboard["Streamlit Interactive Web App<br>(app.py - Port 8501)"]
        Reports["AnyLogic Experiments & Docs<br>• Optimization, Monte Carlo<br>• Sensitivity, Calibration, Report"]
        
        GymEnv --> RL
        RL -->|"Export Policy Weights / JSON"| AnyLogic
        RL -->|"Training Curves & Metrics"| Dashboard
        AnyLogic -->|"Simulation Logs (CSV/JSON)"| Dashboard
        AnyLogic --> Reports
    end

    AnyLogic -->|"HTTP POST / WebSocket Spatial Stream"| Server
    </div>
  </div>
</section>

<section>
  <h2>2. What Each Team Member Needs to Know About the Environment</h2>
  <p>To ensure each team member can work independently without roadblocks, here are the essential environment specifications for each role:</p>

  <div class="step-box">
    <div class="step-header">🧠 For Jordan Gonzalez (Reinforcement Learning Lead)</div>
    <p><strong>Folder:</strong> <code>/rl_models</code> | <strong>Runtime:</strong> Python 3.10+ (Standard library, NumPy, Gymnasium)</p>
    <ul>
      <li><strong>Observation Space (8 Dimensions):</strong>
        <code>[Q_A, Q_B, Q_C, B_1, B_2, B_3, Active_Docks, Demand_Phase]</code>
        <ul>
          <li><code>Q_A, Q_B, Q_C</code>: Queue counts at Parts Shelf, Soldering Bench, and QA Testing (0 to 20).</li>
          <li><code>B_1, B_2, B_3</code>: Battery levels of AMR-01, AMR-02, AMR-03 (0.0 to 1.0).</li>
          <li><code>Active_Docks</code>: Number of AMRs currently occupying Station D charging pads (0 to 2).</li>
          <li><code>Demand_Phase</code>: Multiplier representing class rush hour intensity (0.5 to 1.5).</li>
        </ul>
      </li>
      <li><strong>Action Space (5 Discrete Actions):</strong>
        <code>0</code>: Dispatch AMR to Station A | <code>1</code>: Dispatch to Station B | <code>2</code>: Dispatch to Station C | <code>3</code>: Send lowest-battery AMR to Station D (Charging Dock) | <code>4</code>: Standby / Idle.
      </li>
      <li><strong>Episode Length:</strong> 120 steps (represents a 2-hour lab class session at 1 minute per step).</li>
      <li><strong>Deliverable for Dashboard:</strong> Ensure running <code>train_qlearning.py</code> and <code>train_ppo.py</code> generates <code>q_learning_results.json</code> and <code>ppo_results.json</code>.</li>
    </ul>
  </div>

  <div class="step-box">
    <div class="step-header">📊 For Illia Shybanov (Dashboard & UI Lead)</div>
    <p><strong>Folder:</strong> <code>/dashboard</code> | <strong>Runtime:</strong> Python (Streamlit, Plotly, Pandas)</p>
    <ul>
      <li><strong>Launch Command:</strong> <code>streamlit run app.py</code> (runs locally on <code>http://localhost:8501</code>).</li>
      <li><strong>Data Ingestion:</strong> The dashboard automatically parses results from <code>../rl_models/q_learning_results.json</code> and <code>../rl_models/ppo_results.json</code>.</li>
      <li><strong>Interactive Controls:</strong> Sliders for fleet size (1–6), student request influx (5–40 req/hr), and transit speed (0.5–2.0 m/s) dynamically re-calculate performance KPIs.</li>
      <li><strong>5 Required Tabs:</strong> Operational KPIs, AI Policy Comparison (RL), Simulation Experiments, 3D Digital Twin Status, and Executive Report.</li>
    </ul>
  </div>

  <div class="step-box">
    <div class="step-header">🔬 For Ricardo Molina Gonzalez (Experiments & Documentation Lead)</div>
    <p><strong>Folder:</strong> <code>/docs</code> | <strong>Runtime:</strong> AnyLogic 8 (PLE or University) & Word/Markdown</p>
    <ul>
      <li><strong>AnyLogic Experiments Guide:</strong> <code>docs/ANYLOGIC_EXPERIMENTS_GUIDE.md</code> contains the exact click paths to configure the 5 required AnyLogic experiments:
        <ol>
          <li><strong>Optimization:</strong> Find optimal AMR count (3 AMRs) vs. charging pads (2 docks).</li>
          <li><strong>Compare Runs:</strong> FIFO Baseline vs. Q-Learning vs. PPO.</li>
          <li><strong>Monte Carlo:</strong> 100 replications with stochastic arrival intervals (95% CI).</li>
          <li><strong>Sensitivity Analysis:</strong> Varying battery drain rate (&plusmn;30%) and student influx.</li>
          <li><strong>Calibration:</strong> Calibrating simulated transit speeds against MDC stopwatch data.</li>
        </ol>
      </li>
      <li><strong>Deliverable:</strong> Export experiment charts/data tables and place them into the <code>FINAL_PROJECT_REPORT_TEMPLATE.md</code> and presentation slides.</li>
    </ul>
  </div>

  <div class="step-box">
    <div class="step-header">🏗️ For Jorge A Mendoza (AnyLogic Model Architect & Team Lead)</div>
    <p><strong>Folder:</strong> <code>/anylogic_model</code> | <strong>Runtime:</strong> AnyLogic 8 + Node.js (Port 3000)</p>
    <ul>
      <li><strong>Model Architecture:</strong> Multi-method connecting Process Modeling Library (DES) blocks to AMR agent statecharts (ABM).</li>
      <li><strong>Spatial Geometry:</strong> Uses <code>assets/robotics_lab_floorplan.png</code> scaled at 1m = 50px ($14.5\text{m} \times 10.2\text{m}$).</li>
      <li><strong>Live Bridge:</strong> AnyLogic triggers HTTP POST updates to <code>http://localhost:3000/api/anylogic/update</code> with current robot coordinates.</li>
    </ul>
  </div>
</section>

<section>
  <h2>3. End-to-End System Testing Protocol</h2>
  <p>When the team is ready to test the entire ecosystem together, follow this 3-terminal sequence:</p>

  <div class="callout callout-success">
    <strong>Terminal 1: Start 3D Digital Twin Server (Visual Layer)</strong>
    <pre>cd "D:\Miami Dade College\AI-3D-Robotics-Lab\digital_twin_app"
npm install
npm start
# Output: Server running on http://localhost:3000</pre>
  </div>

  <div class="callout callout-success">
    <strong>Terminal 2: Run & Verify RL Policies (Decision Layer)</strong>
    <pre>cd "D:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\rl_models"
python train_qlearning.py
python train_ppo.py
# Output: Saves q_learning_results.json, ppo_results.json, and q_table.npy</pre>
  </div>

  <div class="callout callout-success">
    <strong>Terminal 3: Launch Streamlit Dashboard (Presentation Layer)</strong>
    <pre>cd "D:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\dashboard"
pip install -r requirements.txt
streamlit run app.py
# Output: Dashboard opens in browser at http://localhost:8501</pre>
  </div>

  <div class="callout callout-success">
    <strong>Step 4: Launch AnyLogic Simulation Model (Engine Layer)</strong>
    <p>Open <code>anylogic_model/MDC_Robotics_Lab_Simulation.alp</code> in AnyLogic 8, click <strong>Run</strong>, and verify that the DES queues clear dynamically while AMR agents visually navigate the 3D laboratory canvas.</p>
  </div>
</section>

<section>
  <h2>4. Summary of Key Repository Interconnections</h2>
  <table>
    <thead>
      <tr>
        <th>Source Component</th>
        <th>Target Component</th>
        <th>Protocol / Data Format</th>
        <th>What is Transferred</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Gymnasium RL (Jordan)</strong></td>
        <td><strong>AnyLogic Model (Jorge)</strong></td>
        <td>Policy Rules / Lookup Table</td>
        <td>Optimal action logic: When to dispatch to Station A/B/C vs. recharge at Station D.</td>
      </tr>
      <tr>
        <td><strong>AnyLogic Model (Jorge)</strong></td>
        <td><strong>3D Twin Server (Jorge)</strong></td>
        <td>HTTP POST / WebSocket</td>
        <td>Live $(X, Y)$ robot positions, battery voltages, and station statuses.</td>
      </tr>
      <tr>
        <td><strong>RL Models (Jordan)</strong></td>
        <td><strong>Streamlit App (Illia)</strong></td>
        <td>JSON (<code>q_learning_results.json</code>)</td>
        <td>Cumulative rewards, training loss curves, and policy comparison tables.</td>
      </tr>
      <tr>
        <td><strong>AnyLogic Experiments (Ricardo)</strong></td>
        <td><strong>Streamlit & Report (Illia & Ricardo)</strong></td>
        <td>CSV / Plotly Charts</td>
        <td>Monte Carlo confidence intervals, Pareto optimization curve, and sensitivity plots.</td>
      </tr>
    </tbody>
  </table>
</section>

</body>
</html>
"""

def main():
    # Save in both repositories for completeness
    course_docs = Path(r"d:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\docs")
    twin_docs = Path(r"d:\Miami Dade College\AI-3D-Robotics-Lab\Docs")

    course_html = course_docs / "System_Integration_and_Testing_Architecture.html"
    course_pdf = course_docs / "System_Integration_and_Testing_Architecture.pdf"

    twin_html = twin_docs / "System_Integration_and_Testing_Architecture.html"
    twin_pdf = twin_docs / "System_Integration_and_Testing_Architecture.pdf"

    print(f"Writing HTML documentation...")
    course_html.write_text(HTML_CONTENT, encoding="utf-8")
    twin_html.write_text(HTML_CONTENT, encoding="utf-8")

    print(f"Rendering PDF with Microsoft Edge headless...")
    with tempfile.TemporaryDirectory() as tmp:
        profile_dir = Path(tmp) / "profile"
        subprocess.run([
            EDGE,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=8000",
            f"--user-data-dir={profile_dir}",
            f"--print-to-pdf={course_pdf}",
            course_html.as_uri()
        ], check=True)

        # Wait for file to settle
        last = -1
        for _ in range(60):
            size = course_pdf.stat().st_size if course_pdf.exists() else -1
            if size > 0 and size == last:
                break
            last = size
            time.sleep(0.5)

    # Copy PDF to twin_docs as well
    import shutil
    shutil.copy2(course_pdf, twin_pdf)

    print(f"Successfully generated:")
    print(f"Course Docs PDF: {course_pdf} ({course_pdf.stat().st_size} bytes)")
    print(f"Twin Docs PDF:   {twin_pdf} ({twin_pdf.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
