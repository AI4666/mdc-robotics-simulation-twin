# 🔬 AnyLogic Simulation Experiments Guide
**Course:** Simulation for Applied AI — Miami Dade College  
**Assigned to:** Ricardo Molina Gonzalez (Simulation Experiments Lead)  
**Collaborating with:** Jorge A Mendoza (AnyLogic Model Architect)

This guide walks you step-by-step through setting up and running the **five required simulation experiments** in AnyLogic 8.

---

## 1. Optimization Experiment
### Objective
Determine the optimal combination of active AMRs (1 to 5) and charging docks (1 to 3) that minimizes average student wait time while keeping hardware budget under limits.

### Step-by-Step in AnyLogic:
1. In the **Projects** view, right-click your Model $\rightarrow$ **New** $\rightarrow$ **Experiment**.
2. Select **Optimization** and name it `Optimization_FleetSizing`.
3. Set the objective function:
   ```java
   root.averageStudentWaitTime + 0.1 * (root.numberOfAMRs * 12000 + root.numberOfDocks * 3000)
   ```
4. Choose **Minimize**.
5. In **Parameters**, set:
   * `numberOfAMRs`: Discrete range from `1` to `5`, step `1`.
   * `numberOfDocks`: Discrete range from `1` to `3`, step `1`.
6. Run the experiment and export the screenshot/data table of the optimal parameter set to include in the presentation and Streamlit app.

---

## 2. Compare Runs Experiment
### Objective
Compare baseline operation (First-Come-First-Served heuristic with threshold charging) vs. Intelligent RL dispatching (Q-Learning and PPO).

### Step-by-Step in AnyLogic:
1. Right-click Model $\rightarrow$ **New** $\rightarrow$ **Experiment** $\rightarrow$ **Compare Runs**.
2. Name it `Compare_Dispatch_Policies`.
3. Create 3 run configurations:
   * **Run 1 (Baseline FIFO):** `dispatchPolicy = POLICY_FIFO`, `chargingThreshold = 0.20`.
   * **Run 2 (Q-Learning):** `dispatchPolicy = POLICY_QLEARNING`.
   * **Run 3 (PPO):** `dispatchPolicy = POLICY_PPO`.
4. Add a bar chart on the experiment canvas comparing `root.averageStudentWaitTime` and `root.completedOrdersPerHour` across all 3 runs.
5. Export the chart for the technical report.

---

## 3. Monte Carlo Experiment
### Objective
Evaluate the stochastic variation of student wait times across 100 random replications with varying student arrival rates and task durations.

### Step-by-Step in AnyLogic:
1. Right-click Model $\rightarrow$ **New** $\rightarrow$ **Experiment** $\rightarrow$ **Monte Carlo**.
2. Name it `MonteCarlo_WaitTimes`.
3. Set **Number of replications** to `100`.
4. Ensure your student arrival distributions in the model use stochastic functions (e.g., `poisson(18.0 / 60.0)`).
5. Add a **Histogram Data** object bound to `root.averageStudentWaitTime`.
6. Run the experiment to produce the 95% Confidence Interval distribution curve.

---

## 4. Sensitivity Analysis Experiment
### Objective
Test system resilience against battery degradation (discharge rate varying from $-20\%$ to $+50\%$) and student influx surge ($\pm 30\%$).

### Step-by-Step in AnyLogic:
1. Right-click Model $\rightarrow$ **New** $\rightarrow$ **Experiment** $\rightarrow$ **Sensitivity Analysis**.
2. Name it `Sensitivity_BatteryAndDemand`.
3. Select parameter `batteryDischargeRate` with range `0.01` to `0.035`, step `0.005`.
4. Add a secondary variation for `studentArrivalRate` ($10$ to $30$ req/hr).
5. Output expression: `root.averageStudentWaitTime`.
6. Record at what parameter combination the system reaches the tipping point (where queues grow faster than robots can clear them).

---

## 5. Model Calibration Experiment
### Objective
Calibrate simulated AMR transit speeds and pickup delays against stopwatch measurements taken in the physical MDC AI & Robotics Lab room.

### Step-by-Step in AnyLogic:
1. Right-click Model $\rightarrow$ **New** $\rightarrow$ **Experiment** $\rightarrow$ **Calibration**.
2. Name it `Calibration_PhysicalLab`.
3. Define the empirical dataset table (e.g., `observed_transit_times.txt`).
4. Set tunable model parameters:
   * `amrSpeed` (range 0.8 to 1.8 m/s).
   * `stationPickupDelay` (range 30 to 60 sec).
5. AnyLogic will run iterations to minimize the Mean Squared Error (MSE) between simulated times and real-world recorded times.
6. Save the pre- vs. post-calibration fit curve for the report.
