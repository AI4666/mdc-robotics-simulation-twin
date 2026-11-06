# 🤖 MDC AI & Robotics Lab Simulation — Multi-Method Digital Twin

[![Course](https://img.shields.io/badge/Course-Simulation_for_Applied_AI-blue)](https://www.mdc.edu)
[![AnyLogic](https://img.shields.io/badge/AnyLogic-8.8+-orange)](https://www.anylogic.com)
[![Python](https://img.shields.io/badge/Python-3.10%2B-green)](https://www.python.org)
[![Streamlit](https://img.shields.io/badge/Streamlit-Dashboard-red)](https://streamlit.io)

Academic group project developing a Multi-Method simulation (Discrete-Event Modeling + Agent-Based Modeling) with Reinforcement Learning (Q-Learning vs. PPO) for the **Miami Dade College AI & Robotics Lab**.

---

## 👥 Project Team & Work Breakdown Structure

| Member | Primary Role | Core Folder / Deliverables |
| :--- | :--- | :--- |
| **Jorge A Mendoza** | **Project Manager & AnyLogic Model Architect** | `/anylogic_model` — DES process flows, ABM robot statecharts, 3D setup |
| **Jordan Gonzalez** | **Reinforcement Learning Engineer** | `/rl_models` — Custom Gymnasium environment, Q-Learning & PPO training |
| **Illia Shybanov** | **Dashboard & Integration Specialist** | `/dashboard` — Streamlit interactive application, KPI charts, sliders |
| **Ricardo Molina Gonzalez** | **Simulation Experiments & Documentation Lead** | `/docs` — 5 AnyLogic experiments, 2–3 page technical report, presentation deck |

---

## 📁 Repository Directory Structure

```text
mdc_robotics_simulation_twin/
│
├── anylogic_model/               # AnyLogic simulation source files
│   └── (AnyLogic .alp project files, 3D CAD assets)
│
├── rl_models/                    # Reinforcement Learning codebase (Jordan)
│   ├── robotics_lab_env.py       # Custom Gymnasium environment
│   ├── train_qlearning.py        # Tabular / Discretized Q-Learning training
│   ├── train_ppo.py              # Proximal Policy Optimization (PPO) training
│   └── requirements.txt          # Python dependencies for RL
│
├── dashboard/                    # Interactive Streamlit Web App (Illia)
│   ├── app.py                    # 5-Tab Streamlit Dashboard
│   └── requirements.txt          # Web app dependencies (streamlit, plotly, pandas)
│
└── docs/                         # Reports, Guides & Presentation (Ricardo)
    ├── ANYLOGIC_EXPERIMENTS_GUIDE.md     # Step-by-step for the 5 AnyLogic experiments
    ├── FINAL_PROJECT_REPORT_TEMPLATE.md  # 2-3 page written summary paper
    ├── PRESENTATION_SLIDES_OUTLINE.md    # 10-12 minute presentation script
    ├── MDC_Robotics_Lab_Project_Proposal.pdf # Master proposal with conceptual diagrams
    └── MDC_Robotics_Lab_Project_Proposal.html
```

---

## 🚀 Quick Start Guide

### 1. Running the Reinforcement Learning Training (Jordan)
```bash
cd rl_models
pip install -r requirements.txt
python train_qlearning.py
python train_ppo.py
```

### 2. Running the Interactive Streamlit Dashboard (Illia)
```bash
cd dashboard
pip install -r requirements.txt
streamlit run app.py
```

### 3. Running AnyLogic Simulation Experiments (Jorge & Ricardo)
1. Open AnyLogic 8.
2. Load the `.alp` file inside `/anylogic_model`.
3. Follow `docs/ANYLOGIC_EXPERIMENTS_GUIDE.md` to run the 5 experiments (Optimization, Compare Runs, Monte Carlo, Sensitivity, Calibration).

---

## 📋 Professor Accountability & Submission Checklist
* [ ] 1 Week After Start: Evidence of work started submitted.
* [ ] 1 Week Before Due: Evidence of work finished submitted & peer grading forms completed.
* [ ] Individual Module 4 Lesson 1 (Stages 1–3) zip files gathered for each member:
  * Jorge A Mendoza
  * Jordan Gonzalez
  * Illia Shybanov
  * Ricardo Molina Gonzalez
* [ ] Final unified `.zip` file package assembled for Canvas.
