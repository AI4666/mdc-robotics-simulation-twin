# 📄 Academic Simulation Project Report
**Course:** Simulation for Applied AI  
**Institution:** Miami Dade College (MDC)  
**Project Title:** Autonomous Fleet Dispatch & Resource Optimization for the MDC AI & Robotics Lab  
**Authors:** Jorge A Mendoza, Jordan Gonzalez, Illia Shybanov, Ricardo Molina Gonzalez  
**Submission Date:** Fall 2026

---

## 1. Problem Description & Real-World Relevance

### 1.1 Context & Background
The Miami Dade College AI & Robotics Lab serves as an active hands-on facility where engineering and artificial intelligence students design, prototype, and test robotics systems. During peak class and open lab hours, students frequently require discrete electronic components from the centralized parts inventory (Station A), soldering and wiring benches (Station B), and specialized QA testing rigs (Station C). 

### 1.2 Problem Statement & Stakeholder Impact
Under the existing manual system, students experience substantial waiting periods averaging 9.8 minutes per request, resulting in idle workbench time and project delays. Furthermore, autonomous mobile robots (AMRs) deployed to automate component delivery frequently suffer from reactive battery management: robots charge only when their batteries drop below critical thresholds, often leading to multiple AMRs docking simultaneously at Station D and causing a complete halt in delivery services during peak lab hours.

**Key Stakeholders:**
* **MDC Students:** Suffer educational downtime while waiting for parts and bench access.
* **Lab Directors & Faculty:** Need maximized equipment utilization and smooth class operations without lab gridlock.
* **Lab Technicians:** Suffer repetitive manual delivery burdens that detract from mentoring students.

---

## 2. Multi-Method Simulation Modeling Approach

### 2.1 Why Multi-Method (DES + ABM)?
A single simulation paradigm cannot adequately capture both queue dynamics and physical spatial kinematics:
* **Discrete-Event Simulation (DES):** Successfully captures the transactional nature of student work orders, inventory queues, and bench service times.
* **Agent-Based Modeling (ABM):** Captures individual AMR behaviors, battery degradation curves, autonomous obstacle avoidance, and dynamic routing across the laboratory floor.
* Combining DES and ABM inside **AnyLogic 8** allows student order entities to seize physical AMR agents, simulating physical movement and service delivery in real time.

### 2.2 Conceptual Architecture & Statecharts
The model architecture connects a DES work order pipeline (`Source` $\rightarrow$ `Queue` $\rightarrow$ `Seize AMR` $\rightarrow$ `Transit Delay` $\rightarrow$ `Service Delay` $\rightarrow$ `Release` $\rightarrow$ `Sink`) with an autonomous AMR agent state machine consisting of `Idle`, `Active Service`, and `Charging Routine` states.

---

## 3. Reinforcement Learning Supervisory Control (Q-Learning vs. PPO)

To optimize fleet dispatching and prevent the "simultaneous charging cascade," two reinforcement learning policies were developed and benchmarked:
1. **Discretized Q-Learning:** A tabular action-value model trained over 600 episodes using an $\epsilon$-greedy exploration schedule.
2. **Proximal Policy Optimization (PPO):** An actor-critic policy trained using continuous advantage estimation and clipped surrogate objectives.

### Mathematical Formulation
$$\text{Reward} = + 10 \cdot N_{\text{completed}} - 0.5 \cdot \sum \text{Queues} - 25 \cdot \mathbb{I}(\text{Battery} \le 5\%) - 2 \cdot \text{DockContention}$$

---

## 4. Key Simulation Results & Experiment Analysis

### 4.1 Comparative Analysis (Baseline vs. Q-Learning vs. PPO)
| Metric | Baseline (FIFO) | Q-Learning | PPO (Optimized) | Improvement (%) |
| :--- | :--- | :--- | :--- | :--- |
| **Mean Student Wait Time** | 9.8 min | 4.5 min | **3.2 min** | **67.3% Reduction** |
| **Work Order Throughput** | 13.0 jobs/hr | 16.0 jobs/hr | **17.4 jobs/hr** | **+33.8% Increase** |
| **Battery Stalls (0% Stoppage)** | 4.2 / day | 0.0 / day | **0.0 / day** | **100% Elimination** |
| **Station D Dock Queue Time** | 8.2 min | 2.1 min | **0.8 min** | **90.2% Reduction** |

### 4.2 Findings From Simulation Experiments
1. **Optimization Experiment:** Confirmed that an active fleet of **3 AMRs** and **2 Station D charging pads** represents the economic Pareto frontier for the MDC laboratory layout.
2. **Monte Carlo (100 Replications):** Demonstrated a 95% confidence interval for student wait times bounded between **2.35 and 4.08 minutes** under PPO control.
3. **Sensitivity Analysis:** Identified that when student influx exceeds 28 requests/hour, battery discharge rates increase by 42%, necessitating dynamic keep-out corridors to prevent AMR aisle congestion.
4. **Calibration:** Calibrated simulated transit times against stopwatch observations from the physical MDC lab floor, achieving $R^2 = 0.992$.

---

## 5. Non-Obvious Insights & Operational Recommendations

### 5.1 What Did the Model Reveal That Was Not Obvious Before?
* **The "Charging Cascade" Trap:** Conventional threshold charging (charge when $< 20\%$) causes all robots to deplete simultaneously around midday. The PPO policy solved this by performing opportunistic short top-offs when queues were calm, even if battery was at 65%.
* **Diminishing Returns of Fleet Size:** Increasing the fleet from 3 to 5 AMRs actually *increased* delivery times during peak hours due to physical hallway bottlenecks near Station B.

### 5.2 Recommendations for MDC Lab Directors
1. **Implement Opportunistic Smart Charging:** Deploy the PPO dispatch rule to stagger robot recharge cycles.
2. **Cap Active Fleet at 3 AMRs:** Do not purchase additional AMR units; 3 robots provide maximum throughput without causing hallway gridlock.
3. **Designate Station C Priority Zones:** Establish dedicated right-of-way pathways for QA testing couriers to prevent cross-traffic deadlocks.

---

## 6. Model Limitations & Future Work
* Current simulation assumes static floor friction; future iterations could incorporate dynamic student foot-traffic pedestrian models.
* The RL policy was trained in a Gymnasium environment; future work should deploy the policy directly to the physical Unitree humanoid and AMR fleet via ROS 2.
