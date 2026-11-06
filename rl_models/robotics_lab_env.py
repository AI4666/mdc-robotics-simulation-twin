"""
Custom Gymnasium Environment for MDC AI & Robotics Lab Simulation
Models work order queues across Stations A, B, C, AMR fleet dispatch, and battery charging.
Assigned to: Jordan Gonzalez (RL Lead)
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np


class MDCRoboticsLabEnv(gym.Env):
    """
    Simulation Environment for MDC Robotics Lab Task Allocation & Battery Scheduling.

    State / Observation Space (Box of shape (8,)):
      [0] Q_A: Queue length at Station A (Parts Shelf) (0 - 20)
      [1] Q_B: Queue length at Station B (Electronics Bench) (0 - 20)
      [2] Q_C: Queue length at Station C (Testing Table) (0 - 20)
      [3] B_1: Battery level of AMR-01 (0.0 - 1.0)
      [4] B_2: Battery level of AMR-02 (0.0 - 1.0)
      [5] B_3: Battery level of AMR-03 (0.0 - 1.0)
      [6] Active_Charging: Number of AMRs currently on Station D dock (0 - 2)
      [7] Demand_Phase: Lab hour intensity (0.5 = normal, 1.0 = peak lab session)

    Action Space (Discrete(5)):
      0: Dispatch available AMR to Station A (Parts retrieval)
      1: Dispatch available AMR to Station B (Soldering / assembly support)
      2: Dispatch available AMR to Station C (QA testing support)
      3: Route lowest-battery AMR to Station D (Recharge pad)
      4: Hold in standby / opportunistic idle
    """

    metadata = {"render_modes": ["human"]}

    def __init__(self, render_mode=None):
        super().__init__()
        self.render_mode = render_mode

        # Low and high boundaries for observation space
        low = np.array([0, 0, 0, 0.0, 0.0, 0.0, 0, 0.0], dtype=np.float32)
        high = np.array([20, 20, 20, 1.0, 1.0, 1.0, 2, 1.5], dtype=np.float32)
        self.observation_space = spaces.Box(low=low, high=high, dtype=np.float32)

        # 5 discrete supervisor dispatch actions
        self.action_space = spaces.Discrete(5)

        # Environment constants
        self.max_steps = 120  # e.g., 2-hour class session at 1 step/minute
        self.current_step = 0

        # Robot states: 0=Idle, 1=Servicing Station A, 2=Servicing Station B, 3=Servicing Station C, 4=Charging
        self.robot_states = [0, 0, 0]
        self.batteries = [1.0, 1.0, 1.0]
        self.queues = [0, 0, 0]
        self.charging_docks_occupied = 0
        self.demand_phase = 1.0

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.current_step = 0

        # Initial conditions: small starting queues, fully charged batteries
        self.queues = [
            int(self.np_random.integers(1, 4)),
            int(self.np_random.integers(1, 3)),
            int(self.np_random.integers(0, 2)),
        ]
        self.batteries = [1.0, 0.95, 0.90]
        self.robot_states = [0, 0, 0]
        self.charging_docks_occupied = 0
        self.demand_phase = 1.0

        return self._get_obs(), {}

    def _get_obs(self):
        return np.array(
            [
                float(self.queues[0]),
                float(self.queues[1]),
                float(self.queues[2]),
                float(self.batteries[0]),
                float(self.batteries[1]),
                float(self.batteries[2]),
                float(self.charging_docks_occupied),
                float(self.demand_phase),
            ],
            dtype=np.float32,
        )

    def step(self, action):
        self.current_step += 1
        reward = 0.0
        completed_orders = 0

        # 1. New student request arrivals (Poisson-like stochastic arrivals)
        arrival_probs = [0.4 * self.demand_phase, 0.3 * self.demand_phase, 0.2 * self.demand_phase]
        for i in range(3):
            if self.np_random.random() < arrival_probs[i]:
                self.queues[i] = min(20, self.queues[i] + 1)

        # 2. Find available (idle) robots
        available_robots = [i for i, state in enumerate(self.robot_states) if state == 0 and self.batteries[i] > 0.15]

        # 3. Apply Action
        if action in [0, 1, 2]:  # Dispatch to Station A, B, or C
            target_station = action
            if available_robots and self.queues[target_station] > 0:
                selected_bot = available_robots[0]
                self.robot_states[selected_bot] = target_station + 1  # 1=A, 2=B, 3=C
                self.queues[target_station] -= 1
                completed_orders += 1
                reward += 12.0  # Positive reward for order pickup/dispatch
            else:
                reward -= 2.0  # Penalty for attempting dispatch with no idle robots or empty queue

        elif action == 3:  # Route lowest battery AMR to Station D (Charging Dock)
            # Find robot with lowest battery not already charging
            dockable = [i for i in range(3) if self.robot_states[i] != 4]
            if dockable and self.charging_docks_occupied < 2:
                lowest_bot = min(dockable, key=lambda i: self.batteries[i])
                if self.batteries[lowest_bot] < 0.75:
                    self.robot_states[lowest_bot] = 4  # Charging state
                    self.charging_docks_occupied += 1
                    reward += 5.0  # Good preventive charging decision
                else:
                    reward -= 3.0  # Unnecessary charging when battery is still high
            else:
                reward -= 2.0  # All docks full or invalid

        elif action == 4:  # Standby
            reward += 0.5  # Small stability bonus if queues are low

        # 4. Progress active robot tasks & update battery physics
        for i in range(3):
            if self.robot_states[i] in [1, 2, 3]:  # Active servicing
                self.batteries[i] = max(0.0, self.batteries[i] - 0.015)
                # 40% chance task finishes this step
                if self.np_random.random() < 0.40:
                    self.robot_states[i] = 0  # Return to Idle
            elif self.robot_states[i] == 4:  # Charging at Station D
                self.batteries[i] = min(1.0, self.batteries[i] + 0.05)
                if self.batteries[i] >= 0.95:
                    self.robot_states[i] = 0  # Finished charging
                    self.charging_docks_occupied = max(0, self.charging_docks_occupied - 1)
            else:  # Idle drain
                self.batteries[i] = max(0.0, self.batteries[i] - 0.002)

            # Heavy penalty if an AMR dies in service
            if self.batteries[i] <= 0.05:
                reward -= 30.0

        # 5. Queue backlog penalty (minimizing student wait times)
        total_backlog = sum(self.queues)
        reward -= 0.5 * total_backlog

        # Termination conditions
        terminated = self.current_step >= self.max_steps
        truncated = False

        info = {
            "completed_orders": completed_orders,
            "total_backlog": total_backlog,
            "avg_battery": np.mean(self.batteries),
        }

        return self._get_obs(), reward, terminated, truncated, info
