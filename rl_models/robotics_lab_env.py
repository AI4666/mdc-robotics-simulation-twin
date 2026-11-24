"""
Custom Gymnasium Environment for MDC Campus Courier Simulation (Option 2).
Models autonomous mail/package delivery rovers across MDC North Campus buildings,
incorporating vendor arrival waves, mailroom clerk sorting, rover capacity (5 slots),
battery discharge/recharging, and pedestrian congestion during hourly class changes.

Grounded in AnyLogic 8.9 model specifications (MDC_Campus_Courier.alp) by Ricardo Molina.
Assigned to: Jordan Gonzalez (RL Lead)
"""

import numpy as np

try:
    import gymnasium as gym
    from gymnasium import spaces
    GYM_AVAILABLE = True
    EnvBase = gym.Env
except ImportError:
    try:
        import gym
        from gym import spaces
        GYM_AVAILABLE = True
        EnvBase = gym.Env
    except ImportError:
        GYM_AVAILABLE = False
        class EnvBase:
            pass
        class MockSpaces:
            class Box:
                def __init__(self, low, high, shape=None, dtype=np.float32):
                    self.low = low
                    self.high = high
                    self.shape = shape
                    self.dtype = dtype
                def sample(self):
                    return np.random.uniform(self.low, self.high, size=self.shape).astype(self.dtype)
            class Discrete:
                def __init__(self, n):
                    self.n = n
                def sample(self):
                    return int(np.random.randint(0, self.n))
        spaces = MockSpaces()


# ==============================================================================
# Campus Infrastructure & Calibration Parameters (from AnyLogic v2)
# ==============================================================================
# Building nodes and office counts from MDC North Directory
# Total non-depot offices = 48. Mail distribution is proportional to offices.
BUILDINGS = {
    "b1": {"name": "Building 1 (Admin/Testing)", "offices": 25, "dist_m": 198.0},
    "b2": {"name": "Building 2 (Library)",        "offices": 9,  "dist_m": 330.0},
    "b4": {"name": "Building 4 (Student Life)",   "offices": 4,  "dist_m": 187.0},
    "b5": {"name": "Building 5 (Arts)",           "offices": 1,  "dist_m": 255.0},
    "b6": {"name": "Building 6 (ACCESS)",         "offices": 1,  "dist_m": 158.0},
    "b7": {"name": "Building 7 (English/Math)",   "offices": 3,  "dist_m": 128.0},
    "ba": {"name": "Building A (Science)",        "offices": 2,  "dist_m": 292.0},
    "bj": {"name": "Building J (Justice)",        "offices": 1,  "dist_m": 193.0},
}
BUILDING_KEYS = list(BUILDINGS.keys())
OFFICE_COUNTS = np.array([BUILDINGS[k]["offices"] for k in BUILDING_KEYS], dtype=np.float32)
BUILDING_PROBS = OFFICE_COUNTS / np.sum(OFFICE_COUNTS)
BUILDING_DISTANCES = np.array([BUILDINGS[k]["dist_m"] for k in BUILDING_KEYS], dtype=np.float32)

# Depot is Building 3 (Duplicating & Mail Center, Rm 3103)
# 4% of mail is for Building 3 itself and delivered immediately inside.


class MDCRoboticsLabEnv(EnvBase):
    """
    Supervisory Dispatch Environment for MDC North Campus Mail Delivery Robots.

    Decision Interval: Every 5 minutes between 08:00 and 17:00 (108 steps / day).
    Fleet: 6 Autonomous Mobile Robots (AMR-01 .. AMR-06).
    Capacity: 5 package slots per rover (25 letters = 1 slot unit).
    Charger: 2 charging pads at Building 3 mailroom (+0.8% battery / min).

    Action Space (Discrete(4)):
      0: WAIT      - Hold idle rovers to accumulate fuller batches
      1: SEND_ONE  - Dispatch 1 available rover to most backlogged building (up to 5 slots)
      2: SEND_ALL  - Dispatch all available eligible rovers
      3: CHARGE    - Send lowest-battery idle rover (< 90%) to a free charging pad

    Observation Space (Box(8,)):
      [0] sorted_waiting_units_norm : Sorted mail waiting at mailroom (0.0 - 1.0, scaled / 15)
      [1] free_rovers_fraction      : Fraction of fleet idle at mailroom (0.0 - 1.0)
      [2] avg_fleet_battery         : Mean battery percentage across all 6 rovers (0.0 - 1.0)
      [3] min_fleet_battery         : Lowest rover battery percentage (0.0 - 1.0)
      [4] charger_occupancy         : Fraction of charging pads in use (0.0, 0.5, 1.0)
      [5] time_of_day_fraction      : Day progress from 08:00 to 17:00 (0.0 - 1.0)
      [6] class_change_soon         : Pedestrian surge active/imminent (1.0 if min >= 40, else 0.0)
      [7] total_unsorted_norm       : Unsorted mail backlog in mailroom (0.0 - 1.0, scaled / 50)
    """

    metadata = {"render_modes": ["human"]}

    def __init__(self, render_mode=None):
        super().__init__()
        self.render_mode = render_mode

        # Observation space: 8 normalized features [0.0, 1.0]
        self.observation_space = spaces.Box(
            low=np.zeros(8, dtype=np.float32),
            high=np.ones(8, dtype=np.float32),
            dtype=np.float32,
        )

        # 4 discrete supervisor dispatch actions
        self.action_space = spaces.Discrete(4)

        # Simulation parameters matching AnyLogic
        self.num_rovers = 6
        self.rover_capacity = 5.0      # 5 slots per rover
        self.letters_per_slot = 25.0    # 25 letters = 1 slot
        self.num_charging_pads = 2
        self.step_minutes = 5.0        # 5 minutes per RL decision step
        self.start_hour = 8.0          # 08:00 AM
        self.end_hour = 17.0           # 17:00 PM
        self.total_steps = int((self.end_hour - self.start_hour) * 60 / self.step_minutes)  # 108 steps

        # Physical constants calibrated by Ricardo
        self.rover_speed_mps = 1.2
        self.battery_drain_per_minute = 0.8  # 0.8% per travel minute (~11% / km)
        self.charge_rate_per_minute = 0.8    # +0.8% per minute on charger (+4.0% per 5-min step)

        # Penalty / Reward constants (AnyLogic qReward weights)
        self.rl_wait_penalty = 0.02          # per waiting unit * 5 min
        self.rl_energy_penalty = 0.5         # per % battery used
        self.rl_carryover_penalty = 0.5      # per item left in mailroom at 17:00

        # State storage
        self.np_random = None
        self.current_step = 0

        # Rover states: 0 = Idle at depot, 1 = In transit, 2 = Charging
        self.rover_status = np.zeros(self.num_rovers, dtype=np.int32)
        self.rover_battery = np.ones(self.num_rovers, dtype=np.float32) * 100.0
        self.rover_busy_steps = np.zeros(self.num_rovers, dtype=np.int32)
        self.rover_trip_km = np.zeros(self.num_rovers, dtype=np.float32)

        # Mail queues
        self.unsorted_packages = 0.0
        self.unsorted_letters = 0.0
        self.building_outbox_units = np.zeros(len(BUILDING_KEYS), dtype=np.float32)

        # Daily performance tracking
        self.day_arrived_units = 0.0
        self.day_delivered_units = 0.0
        self.day_energy_spent_pct = 0.0
        self.day_distance_km = 0.0
        self.day_wait_unit_minutes = 0.0
        self.depleted_events = 0

    def reset(self, seed=None, options=None):
        if GYM_AVAILABLE and hasattr(super(), "reset"):
            super().reset(seed=seed)
        if seed is not None or self.np_random is None:
            self.np_random = np.random.default_rng(seed)

        self.current_step = 0

        # Fleet initializes fully charged at depot
        self.rover_status = np.zeros(self.num_rovers, dtype=np.int32)
        self.rover_battery = np.full(self.num_rovers, 100.0, dtype=np.float32)
        self.rover_busy_steps = np.zeros(self.num_rovers, dtype=np.int32)
        self.rover_trip_km = np.zeros(self.num_rovers, dtype=np.float32)

        # Mail state
        self.unsorted_packages = 0.0
        self.unsorted_letters = 0.0
        self.building_outbox_units = np.zeros(len(BUILDING_KEYS), dtype=np.float32)

        # Metrics
        self.day_arrived_units = 0.0
        self.day_delivered_units = 0.0
        self.day_energy_spent_pct = 0.0
        self.day_distance_km = 0.0
        self.day_wait_unit_minutes = 0.0
        self.depleted_events = 0

        # Pre-seed early morning newspapers (arrived before 08:00)
        early_papers = float(self.np_random.poisson(20))
        self.unsorted_letters += early_papers
        self.day_arrived_units += early_papers / self.letters_per_slot

        # Initial sort step
        self._simulate_mailroom_sorting(minutes=15)

        return self._get_obs(), {}

    def _get_hour(self):
        return self.start_hour + (self.current_step * self.step_minutes) / 60.0

    def _is_class_change(self):
        """Class change occurs during the last 10 minutes of each hour (min >= 50)."""
        minute = (self._get_hour() * 60.0) % 60.0
        return minute >= 50.0

    def _is_class_change_soon(self):
        """AnyLogic soon flag: within 10 min of class change (min >= 40)."""
        minute = (self._get_hour() * 60.0) % 60.0
        return minute >= 40.0

    def _simulate_vendor_arrivals(self):
        """Simulate stochastic vendor arrival windows based on AnyLogic distributions."""
        hour = self._get_hour()

        # 1. USPS drop: ~10:00 AM (between 9:45 and 10:30, steps 21 to 30)
        if 9.75 <= hour < 10.25 and self.np_random.random() < 0.35:
            letters = float(self.np_random.poisson(60))
            pkgs = float(self.np_random.poisson(5))
            self.unsorted_letters += letters
            self.unsorted_packages += pkgs
            self.day_arrived_units += (letters / self.letters_per_slot) + pkgs

        # 2. Amazon: 2-3 drops throughout the day (08:30 to 15:30)
        if 8.5 <= hour < 15.5 and self.np_random.random() < 0.12:
            pkgs = float(self.np_random.poisson(8))
            self.unsorted_packages += pkgs
            self.day_arrived_units += pkgs

        # 3. UPS / FedEx morning drops (09:00 to 12:30)
        if 9.0 <= hour < 12.5 and self.np_random.random() < 0.10:
            pkgs = float(self.np_random.poisson(6))
            self.unsorted_packages += pkgs
            self.day_arrived_units += pkgs

        # 4. Other random delivery (afternoon)
        if 13.0 <= hour < 16.0 and self.np_random.random() < 0.05:
            pkgs = float(self.np_random.poisson(3))
            self.unsorted_packages += pkgs
            self.day_arrived_units += pkgs

    def _simulate_mailroom_sorting(self, minutes=5.0):
        """
        3 clerks sort incoming mail into building outbox bins.
        Sorting speeds: letters ~5s (60/min across 3 clerks), packages ~45s (4/min across 3 clerks).
        """
        # Clerks process letters
        letters_to_sort = min(self.unsorted_letters, 20.0 * (minutes / 5.0) * 3)
        if letters_to_sort > 0:
            self.unsorted_letters -= letters_to_sort
            sorted_units = letters_to_sort / self.letters_per_slot
            # Distribute across buildings proportionally
            self.building_outbox_units += sorted_units * BUILDING_PROBS

        # Clerks process packages
        pkgs_to_sort = min(self.unsorted_packages, 4.0 * (minutes / 5.0) * 3)
        if pkgs_to_sort > 0:
            self.unsorted_packages -= pkgs_to_sort
            self.building_outbox_units += pkgs_to_sort * BUILDING_PROBS

    def _get_obs(self):
        waiting_units = float(np.sum(self.building_outbox_units))
        free_count = float(np.sum(self.rover_status == 0))
        occupied_chargers = float(np.sum(self.rover_status == 2))
        avg_batt = float(np.mean(self.rover_battery) / 100.0)
        min_batt = float(np.min(self.rover_battery) / 100.0)
        time_frac = float(self.current_step / max(1, self.total_steps))
        cc_soon = 1.0 if self._is_class_change_soon() else 0.0
        unsorted_norm = float(min(1.0, (self.unsorted_packages + self.unsorted_letters / self.letters_per_slot) / 50.0))

        return np.array(
            [
                min(1.0, waiting_units / 15.0),
                free_count / self.num_rovers,
                avg_batt,
                min_batt,
                occupied_chargers / self.num_charging_pads,
                time_frac,
                cc_soon,
                unsorted_norm,
            ],
            dtype=np.float32,
        )

    def get_discrete_state(self):
        """
        Calculates the exact 288-state index (0 to 287) used by AnyLogic's qState() method:
          ready: 0 if u <= 0.01 else (1 if u < 2 else (2 if u < 5 else 3))
          free : min(2, free_rovers)
          batt : 0 if avg_batt < 40% else (1 if avg_batt < 70% else 2)
          block: 0 if h < 10 else (1 if h < 12 else (2 if h < 14 else 3))
          soon : 1 if within 10 min of class change else 0
          index = (((ready * 3 + free) * 3 + batt) * 4 + block) * 2 + soon
        """
        u = float(np.sum(self.building_outbox_units))
        ready = 0 if u <= 0.01 else (1 if u < 2.0 else (2 if u < self.rover_capacity else 3))

        free_count = int(np.sum(self.rover_status == 0))
        free = min(2, free_count)

        avg_b = float(np.mean(self.rover_battery))
        batt = 0 if avg_b < 40.0 else (1 if avg_b < 70.0 else 2)

        h = self._get_hour()
        block = 0 if h < 10.0 else (1 if h < 12.0 else (2 if h < 14.0 else 3))

        soon = 1 if self._is_class_change_soon() else 0

        state_idx = (((ready * 3 + free) * 3 + batt) * 4 + block) * 2 + soon
        return int(np.clip(state_idx, 0, 287))

    def _dispatch_one_rover(self):
        """
        Dispatches 1 eligible idle rover: loads fullest building first,
        then nearest buildings up to 5 package slots.
        """
        idle_indices = np.where((self.rover_status == 0) & (self.rover_battery > 20.0))[0]
        if len(idle_indices) == 0:
            return False

        waiting_units = float(np.sum(self.building_outbox_units))
        if waiting_units < 0.1:
            return False

        rover_idx = idle_indices[0]

        # Prioritize fullest building outbox
        primary_bldg = int(np.argmax(self.building_outbox_units))
        slots_to_fill = self.rover_capacity
        units_loaded = 0.0
        visited_buildings = [primary_bldg]

        # Order other buildings by distance to primary building
        dist_from_primary = np.abs(BUILDING_DISTANCES - BUILDING_DISTANCES[primary_bldg])
        order = sorted(range(len(BUILDING_KEYS)), key=lambda i: dist_from_primary[i])

        for b in order:
            avail = self.building_outbox_units[b]
            if avail > 0:
                take = min(avail, slots_to_fill)
                self.building_outbox_units[b] -= take
                slots_to_fill -= take
                units_loaded += take
                if b not in visited_buildings:
                    visited_buildings.append(b)
            if slots_to_fill <= 0:
                break

        if units_loaded <= 0:
            return False

        # Calculate trip distance (round trip)
        farthest_dist = max(BUILDING_DISTANCES[b] for b in visited_buildings)
        round_trip_dist_m = farthest_dist * 2.2  # round trip + inter-building hop
        trip_km = round_trip_dist_m / 1000.0

        # Trip duration with crowd factor
        base_trip_minutes = (round_trip_dist_m / self.rover_speed_mps) / 60.0 + (len(visited_buildings) * 1.0)
        crowd_multiplier = 1.75 if self._is_class_change() else 1.0
        actual_trip_minutes = base_trip_minutes * crowd_multiplier

        # Steps needed (each step is 5 minutes, min 1 step)
        steps_busy = max(1, int(np.ceil(actual_trip_minutes / self.step_minutes)))

        # Battery consumption: 0.8% per travel minute
        battery_used = actual_trip_minutes * self.battery_drain_per_minute

        self.rover_status[rover_idx] = 1  # In transit
        self.rover_busy_steps[rover_idx] = steps_busy
        self.rover_trip_km[rover_idx] = trip_km
        self.rover_battery[rover_idx] = max(0.0, self.rover_battery[rover_idx] - battery_used)

        if self.rover_battery[rover_idx] <= 0.0:
            self.depleted_events += 1

        self.day_delivered_units += units_loaded
        self.day_energy_spent_pct += battery_used
        self.day_distance_km += trip_km

        return units_loaded, battery_used

    def step(self, action):
        self.current_step += 1

        # 1. Simulate new vendor arrivals & mailroom clerk sorting
        self._simulate_vendor_arrivals()
        self._simulate_mailroom_sorting(minutes=self.step_minutes)

        delivered_this_step = 0.0
        battery_spent_this_step = 0.0

        # 2. Execute Supervisor Action
        if action == 1:  # SEND_ONE
            res = self._dispatch_one_rover()
            if res:
                delivered_this_step += res[0]
                battery_spent_this_step += res[1]

        elif action == 2:  # SEND_ALL
            while True:
                res = self._dispatch_one_rover()
                if not res:
                    break
                delivered_this_step += res[0]
                battery_spent_this_step += res[1]

        elif action == 3:  # CHARGE (send lowest-battery idle rover to charge)
            occupied_pads = np.sum(self.rover_status == 2)
            if occupied_pads < self.num_charging_pads:
                idle_rovers = np.where(self.rover_status == 0)[0]
                if len(idle_rovers) > 0:
                    lowest_rover = idle_rovers[np.argmin(self.rover_battery[idle_rovers])]
                    if self.rover_battery[lowest_rover] < 90.0:
                        self.rover_status[lowest_rover] = 2  # Charging
                        self.rover_busy_steps[lowest_rover] = 4  # Charge for ~20 min

        # Action 0: WAIT (do nothing)

        # 3. Advance active trips and charging for all rovers
        for i in range(self.num_rovers):
            if self.rover_status[i] == 1:  # In transit
                self.rover_busy_steps[i] -= 1
                if self.rover_busy_steps[i] <= 0:
                    self.rover_status[i] = 0  # Returned to depot, now idle

            elif self.rover_status[i] == 2:  # Charging at pad
                self.rover_battery[i] = min(100.0, self.rover_battery[i] + (self.charge_rate_per_minute * self.step_minutes))
                self.rover_busy_steps[i] -= 1
                if self.rover_busy_steps[i] <= 0 or self.rover_battery[i] >= 95.0:
                    self.rover_status[i] = 0  # Finished charging, free for dispatch

        # 4. Calculate Step Reward (AnyLogic qReward formula)
        waiting_units = float(np.sum(self.building_outbox_units))
        self.day_wait_unit_minutes += waiting_units * self.step_minutes

        # Reward = delivered - 0.02 * waiting_units * 5 - 0.5 * battery_%
        reward = (
            delivered_this_step
            - (self.rl_wait_penalty * waiting_units * self.step_minutes)
            - (self.rl_energy_penalty * battery_spent_this_step)
        )

        # 5. Check Termination (End of Day at 17:00 / 108 steps)
        terminated = self.current_step >= self.total_steps
        truncated = False

        if terminated:
            # End-of-day penalty for items left behind in mailroom
            items_left = waiting_units + self.unsorted_packages + (self.unsorted_letters / self.letters_per_slot)
            reward -= self.rl_carryover_penalty * items_left

        # SLA calculation (% delivered same day vs arrived)
        same_day_pct = (
            (self.day_delivered_units / max(0.1, self.day_arrived_units)) * 100.0
            if self.day_arrived_units > 0
            else 100.0
        )

        info = {
            "delivered_this_step": delivered_this_step,
            "total_delivered": self.day_delivered_units,
            "total_arrived": self.day_arrived_units,
            "waiting_units": waiting_units,
            "same_day_pct": min(100.0, same_day_pct),
            "avg_battery": float(np.mean(self.rover_battery)),
            "min_battery": float(np.min(self.rover_battery)),
            "robot_km": float(self.day_distance_km),
            "depleted_events": self.depleted_events,
            "discrete_state": self.get_discrete_state(),
        }

        return self._get_obs(), float(reward), terminated, truncated, info
