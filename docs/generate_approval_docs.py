"""Generate HTML and PDF documentation for the Group Project Problem Statements for Professor Approval.
Course: Simulation for Applied AI - Miami Dade College
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
<title>Group Project Problem Statements for Approval - Miami Dade College</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  @page {
    size: letter;
    margin: 18mm 16mm 18mm 16mm;
    @bottom-center {
      content: "MDC • Simulation for Applied AI • Project Approval Request • Page " counter(page) " of " counter(pages);
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
    padding-bottom: 18px;
    margin-bottom: 28px;
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
    font-size: 1.95rem;
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
    font-size: 1.35rem;
    font-weight: 700;
    color: #0369a1;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 6px;
    margin-top: 30px;
    margin-bottom: 14px;
    break-after: avoid;
  }

  h3 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #0f172a;
    margin-top: 20px;
    margin-bottom: 8px;
    break-after: avoid;
  }

  p {
    margin: 0 0 12px 0;
    color: #334155;
  }

  .proposal-card {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    break-inside: avoid;
  }

  .proposal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }

  .proposal-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #0f172a;
  }

  .proposal-tag {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 9999px;
    letter-spacing: 0.05em;
  }

  .tag-preferred {
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
  }

  .tag-alt {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 16px 0;
    font-size: 0.88rem;
  }

  th {
    background: #f1f5f9;
    color: #0f172a;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    width: 25%;
  }

  td {
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }

  .callout {
    border-left: 4px solid #0284c7;
    background: #f0f9ff;
    padding: 12px 16px;
    border-radius: 0 8px 8px 0;
    margin: 16px 0;
    font-size: 0.92rem;
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
</style>
</head>
<body>

<header>
  <span class="badge">Professor Approval Submission</span>
  <h1>Group Project Problem Statements</h1>
  <p class="subtitle">Submission Document for Course Approval in Simulation for Applied AI</p>
  
  <div class="meta-box">
    <div class="meta-item">
      <strong>Course</strong>
      <span>Simulation for Applied AI</span>
    </div>
    <div class="meta-item">
      <strong>Institution</strong>
      <span>Miami Dade College</span>
    </div>
    <div class="meta-item">
      <strong>Group Members</strong>
      <span>Jorge Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina</span>
    </div>
    <div class="meta-item">
      <strong>Requirement</strong>
      <span>Mandatory 2 Problem Statements (Canvas Inbox)</span>
    </div>
  </div>
</header>

<section>
  <div class="callout">
    <strong>Professor Directive:</strong> Students MUST submit at least TWO problem statements for approval from the professor within ONE week after the assignment is available. The professor will decide whether a problem meets the requirements of the group project AND which problem the group should use as their project.
  </div>
</section>

<section>
  <h2>Problem Statement Options for Review</h2>

  <!-- PROPOSAL 1 -->
  <div class="proposal-card">
    <div class="proposal-header">
      <div class="proposal-title">Option 1: Autonomous Mobile Robot (AMR) Fleet Logistics & Dynamic Recharging in the MDC AI & Robotics Lab</div>
      <span class="proposal-tag tag-preferred">Preferred Proposal</span>
    </div>

    <table>
      <tbody>
        <tr>
          <th>Real-World Setting</th>
          <td><strong>Miami Dade College AI & Robotics Lab</strong> (Classroom facility with shared hardware stations, component bins, and student project benches).</td>
        </tr>
        <tr>
          <th>Problem Statement</th>
          <td>
            During peak laboratory and capstone hours, students experience prolonged wait times (averaging <strong>9.8 minutes</strong> per request) waiting for microcontrollers, sensors, and electronic parts from the central inventory shelf (Station A), causing workbench bottlenecks at Soldering and QA Testing benches (Stations B & C).
            <br><br>
            Concurrently, Autonomous Mobile Robots (AMRs) deployed to automate delivery suffer from reactive battery management (recharging only when depleted below 20%). This causes multiple AMRs to dock simultaneously at Station D, leaving zero active delivery units on the floor during peak class rushes and causing severe service interruptions.
          </td>
        </tr>
        <tr>
          <th>Stakeholders</th>
          <td>MDC Robotics/AI Students, Lab Instructors, Faculty, and Laboratory Technicians.</td>
        </tr>
        <tr>
          <th>Multi-Method Approach (AnyLogic)</th>
          <td>
            <ul>
              <li><strong>Discrete-Event Simulation (DES):</strong> Models the arrival of student work orders (Poisson process), inventory queuing at Station A, and processing delays at workbench stations using AnyLogic's Process Modeling Library.</li>
              <li><strong>Agent-Based Modeling (ABM):</strong> Models individual AMRs (Inspector Alpha, Logistics Beta, Courier Gamma) with autonomous kinematics, spatial navigation on the MDC floorplan, collision avoidance, and battery discharge statecharts.</li>
            </ul>
          </td>
        </tr>
        <tr>
          <th>Reinforcement Learning (RL) Component</th>
          <td>
            Compares <strong>Tabular/Deep Q-Learning</strong> against <strong>Proximal Policy Optimization (PPO)</strong> to solve the supervisory dispatch problem: determining whether an available AMR should service waiting station queues or execute an opportunistic "top-off" charge at Station D during momentary demand lulls.
          </td>
        </tr>
        <tr>
          <th>3D Animation & Dashboard</th>
          <td>Includes native AnyLogic 3D animation of the classroom and an interactive 5-tab <strong>Streamlit Web Dashboard</strong> with parameter sliders, real-time KPIs, and policy comparison graphs.</td>
        </tr>
        <tr>
          <th>Target Outcomes</th>
          <td>Cut average student wait times by &gt;60%, completely eliminate simultaneous battery depletion stoppages, and identify the optimal fleet size (AMRs vs. charging pads).</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PROPOSAL 2 -->
  <div class="proposal-card">
    <div class="proposal-header">
      <div class="proposal-title">Option 2: Smart Campus Autonomous Courier Rover Logistics for Miami Dade College Facilities</div>
      <span class="proposal-tag tag-alt">Alternative Proposal</span>
    </div>

    <table>
      <tbody>
        <tr>
          <th>Real-World Setting</th>
          <td><strong>Miami Dade College Campus Grounds</strong> (Inter-building transport between academic halls, administration, and campus health/science labs).</td>
        </tr>
        <tr>
          <th>Problem Statement</th>
          <td>
            Routine distribution of internal examinations, campus mail, specialized equipment, and medical/lab supplies between campus buildings relies heavily on manual courier staff, leading to delivery delays and high operational costs.
            <br><br>
            Deploying small autonomous ground rovers introduces scheduling bottlenecks: rovers encounter pedestrian traffic congestion during class dismissal surges, experience battery depletion between distant campus facilities, and cause delivery delays if parcel dispatching is not synchronized with campus schedule cycles.
          </td>
        </tr>
        <tr>
          <th>Stakeholders</th>
          <td>MDC Campus Administration, Academic Department Staff, Campus Security, and Pedestrian Students.</td>
        </tr>
        <tr>
          <th>Multi-Method Approach (AnyLogic)</th>
          <td>
            <ul>
              <li><strong>Discrete-Event Simulation (DES):</strong> Models intra-campus delivery request queues, priority sorting of urgent materials, and loading/unloading delays at building hubs.</li>
              <li><strong>Agent-Based Modeling (ABM):</strong> Models autonomous courier rovers navigating outdoor walkways, pedestrian avoidance zones, weather delays, and charging hub docking logic.</li>
            </ul>
          </td>
        </tr>
        <tr>
          <th>Reinforcement Learning (RL) Component</th>
          <td>
            Compares <strong>Q-Learning</strong> vs. <strong>PPO</strong> to optimize multi-parcel batching, dynamic route selection around crowded walkways, and energy-efficient charging schedules.
          </td>
        </tr>
        <tr>
          <th>3D Animation & Dashboard</th>
          <td>Features AnyLogic 3D spatial animation of campus transit pathways alongside a Streamlit dashboard with fleet dispatch controls and route efficiency metrics.</td>
        </tr>
        <tr>
          <th>Target Outcomes</th>
          <td>Maximize on-time delivery percentages (&gt;95%), minimize battery depletion downtime, and determine the optimal rover fleet size vs. charging depot footprint.</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2>Canvas Submission Format Ready to Send</h2>
  <p>Below is the formatted text ready to copy-paste directly into the Canvas Inbox:</p>
  <pre>Subject: Group Project Problem Statements for Approval - Team Jorge Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina Gonzalez

Dear Professor,

In accordance with the group assignment guidelines, our team has prepared two problem statements for your review and approval. Both proposals utilize a Multi-Method simulation approach (DES + ABM in AnyLogic), benchmark two Reinforcement Learning policies (Q-Learning vs. PPO), feature 3D animation, and include an interactive Streamlit dashboard.

OPTION 1 (Preferred): Autonomous Mobile Robot (AMR) Logistics & Dynamic Recharging in the MDC AI & Robotics Lab
- Setting: Miami Dade College AI & Robotics Lab
- Problem: Student wait times for lab parts/equipment (~9.8 min average) and AMR battery depletion stalls during peak hours.
- Modeling: DES for work order queues at Stations A/B/C + ABM for AMR navigation and battery statecharts.
- RL: Comparing Q-Learning vs. PPO for supervisory dispatching and opportunistic charging.
- Desired Outcome: Reduce student wait times by >60% and determine the optimal fleet size (AMRs vs. docks).

OPTION 2 (Alternative): Smart Autonomous Courier Rover Logistics for MDC Campus Facilities
- Setting: Miami Dade College Campus Grounds (inter-building delivery)
- Problem: Delays in transferring departmental supplies, lab samples, and mail via manual couriers; rover traffic and battery scheduling.
- Modeling: DES for parcel dispatch queues + ABM for courier rover agents traversing pedestrian pathways.
- RL: Comparing Q-Learning vs. PPO for parcel batching, walkway congestion avoidance, and charging hub management.
- Desired Outcome: Maximize on-time inter-building delivery and optimize fleet capital investment.

Please let us know which problem statement you approve for our team to proceed with.

Thank you,
Jorge A Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina Gonzalez</pre>
</section>

</body>
</html>
"""

def main():
    course_docs = Path(r"d:\Miami Dade College\Simulation For AI\mdc_robotics_simulation_twin\docs")
    twin_docs = Path(r"d:\Miami Dade College\AI-3D-Robotics-Lab\Docs")

    course_html = course_docs / "Problem_Statements_For_Professor_Approval.html"
    course_pdf = course_docs / "Problem_Statements_For_Professor_Approval.pdf"

    twin_html = twin_docs / "Problem_Statements_For_Professor_Approval.html"
    twin_pdf = twin_docs / "Problem_Statements_For_Professor_Approval.pdf"

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
            "--virtual-time-budget=8000",
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
