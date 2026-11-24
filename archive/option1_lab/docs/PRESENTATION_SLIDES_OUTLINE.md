# 🎤 Presentation Slide Deck Outline (10–12 Minutes)
**Course:** Simulation for Applied AI — Miami Dade College  
**Project:** Autonomous Fleet Dispatch & Resource Optimization for the MDC AI & Robotics Lab  
**Team Members:** Jorge A Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina Gonzalez  

---

### Slide 1: Title Slide (0:00 – 0:45) | Speaker: Jorge
* **Title:** MDC AI & Robotics Lab: Multi-Method Digital Twin & RL Optimization
* **Subtitle:** Discrete-Event (DES) & Agent-Based Modeling (ABM) with Q-Learning and PPO
* **Authors:** Jorge Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina
* **Institution:** Miami Dade College — Fall 2026

### Slide 2: Problem Description & Context (0:45 – 2:00) | Speaker: Jorge
* The real-world situation: MDC Robotics & AI Lab daily operations.
* Equipment bottlenecks: Parts Shelf (Station A), Soldering Benches (Station B), QA Testing (Station C).
* Inefficiencies: Long student wait times (9.8 min average) and AMR battery depletion stalls.
* Key Stakeholders: MDC Students, Lab Instructors, and Lab Technicians.

### Slide 3: Multi-Method Modeling Approach (2:00 – 3:30) | Speaker: Jorge
* Why Multi-Method? 
  * DES for transactional work orders, queues, and service delays.
  * ABM for physical robot kinematics, battery discharge, and autonomous obstacle navigation.
* Show Causal-Loop Diagram (balancing loops B1, B2, reinforcing loop R1).
* Show DES process flow and AMR agent statechart.

### Slide 4: Simulation Design & Software (AnyLogic) (3:30 – 5:00) | Speaker: Jorge
* Model logic in AnyLogic 8.
* Integration of floorplan layout and 3D spatial animation.
* Parameter configuration: Arrival rates, service distributions, battery discharge rates.

### Slide 5: Reinforcement Learning Control (5:00 – 6:45) | Speaker: Jordan
* The Supervisory Dispatch Problem: When to deliver vs. when to recharge.
* Formulation of State Space (8 dimensions), Action Space (5 actions), and Reward Function.
* Comparing two RL paradigms:
  * **Tabular Q-Learning:** Discretized states, $\epsilon$-greedy exploration.
  * **Proximal Policy Optimization (PPO):** Actor-Critic policy gradient with clipped objective.
* Convergence curves: PPO learns to anticipate peak hours and recharge preemptively.

### Slide 6: Interactive Streamlit Dashboard Demo (6:45 – 8:15) | Speaker: Illia
* Live demo or walkthrough of the Streamlit Web Application:
  * Tab 1: Interactive user inputs and sliders (fleet size, arrival rates).
  * Tab 2: Operational KPIs (wait times, throughput, energy health).
  * Tab 3: Q-Learning vs. PPO comparative metrics.
  * Tab 4: 3D Digital Twin status and telemetry.

### Slide 7: AnyLogic Simulation Experiments (8:15 – 9:45) | Speaker: Ricardo
* Visualizing the 5 required AnyLogic experiments:
  1. **Optimization:** Finding the optimal 3-AMR fleet size.
  2. **Compare Runs:** Head-to-head comparison of Baseline vs. Q-Learning vs. PPO.
  3. **Monte Carlo:** 100 stochastic replications (95% confidence intervals).
  4. **Sensitivity Analysis:** System breaking points under battery aging and demand surges.
  5. **Calibration:** Matching simulated timings with physical MDC stopwatch data ($R^2 = 0.992$).

### Slide 8: Non-Obvious Insights & Recommendations (9:45 – 11:00) | Speaker: Ricardo
* **What did the model reveal that was not obvious before?**
  * The "Simultaneous Charging Cascade" where threshold charging causes all robots to stall at once.
  * Why adding more robots beyond 3 actually hurts performance due to physical aisle congestion.
* **Actionable Recommendations for MDC:**
  * Adopt PPO opportunistic charging policy.
  * Cap active fleet size at 3 AMRs with 2 charging pads.
  * Set up dedicated right-of-way zones near Station C.

### Slide 9: Lessons Learned, Challenges & Conclusion (11:00 – 12:00) | Speaker: All Team
* Technical challenges: Multi-paradigm DES-ABM synchronization, RL state discretization.
* Team contributions and peer accountability.
* Q&A Session with professor and classmates.
