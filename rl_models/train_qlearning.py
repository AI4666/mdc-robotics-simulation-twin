"""
Tabular Q-Learning Training Script for MDC Campus Courier Simulation (Option 2).
Trains a 288-state discrete Q-learning agent, evaluates performance against baseline FIFO
and batching heuristics, and exports Q-tables (NPY & CSV for AnyLogic) and metrics for Streamlit.

Assigned to: Jordan Gonzalez (RL Lead)
"""

import json
import sys
from pathlib import Path

# Ensure rl_models dir is on sys.path for direct or module execution
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from robotics_lab_env import MDCRoboticsLabEnv


def evaluate_heuristic_baseline(env, policy_type="fifo", num_episodes=50):
    """
    Evaluates baseline heuristics:
      'fifo': Send rovers immediately whenever mail is available (Policy 0)
      'batching': Send rovers only when mail fills >= 60% of rover (Policy 1)
    """
    rewards = []
    same_day_pcts = []
    end_backlogs = []
    end_batteries = []
    total_kms = []

    for ep in range(num_episodes):
        obs, _ = env.reset(seed=9000 + ep)
        ep_reward = 0.0
        terminated = False
        info = {}

        while not terminated:
            waiting_units = info.get("waiting_units", obs[0] * 15.0)
            free_rovers = int(obs[1] * env.num_rovers)

            if policy_type == "fifo":
                # Policy 0: Send immediately if mail and rover available
                action = 1 if (waiting_units > 0.1 and free_rovers > 0) else 0
            elif policy_type == "batching":
                # Policy 1: Batching heuristic (wait until >= 60% of 5 slots = 3.0 units, or end of day)
                is_urgent = env.current_step >= (env.total_steps - 12)
                action = 1 if ((waiting_units >= 3.0 or is_urgent) and free_rovers > 0) else 0
            else:
                action = 0

            obs, r, terminated, _, info = env.step(action)
            ep_reward += r

        rewards.append(ep_reward)
        same_day_pcts.append(info.get("same_day_pct", 0.0))
        end_backlogs.append(info.get("waiting_units", 0.0))
        end_batteries.append(info.get("avg_battery", 0.0) / 100.0)
        total_kms.append(info.get("robot_km", 0.0))

    return {
        "avg_reward": float(np.mean(rewards)),
        "same_day_pct": float(np.mean(same_day_pcts)),
        "avg_backlog": float(np.mean(end_backlogs)),
        "avg_battery": float(np.mean(end_batteries)),
        "avg_km": float(np.mean(total_kms)),
    }


def train_q_learning(
    episodes=500,
    alpha=0.1,
    gamma=0.95,
    epsilon_start=1.0,
    epsilon_min=0.05,
    decay_rate=0.992,
):
    """
    Trains tabular Q-learning across 288 states and 4 actions.
    Matching AnyLogic's internal state indexing and Q-learning formulation.
    """
    env = MDCRoboticsLabEnv()
    num_states = 288
    num_actions = env.action_space.n

    # Q-table shape: (288, 4)
    q_table = np.zeros((num_states, num_actions), dtype=np.float32)

    episode_rewards = []
    backlog_history = []
    battery_history = []
    same_day_history = []
    km_history = []

    epsilon = epsilon_start

    print(f"[INFO] Starting Q-Learning Training ({episodes} episodes / simulated days)...")
    print(f"       State Space: {num_states} discrete states | Action Space: {num_actions} actions")

    for ep in range(episodes):
        obs, _ = env.reset(seed=ep + 100)
        s = env.get_discrete_state()
        ep_reward = 0.0
        final_info = {}
        terminated = False

        while not terminated:
            # Epsilon-greedy action selection
            if np.random.random() < epsilon:
                action = env.action_space.sample()
            else:
                action = int(np.argmax(q_table[s]))

            obs, reward, terminated, truncated, info = env.step(action)
            next_s = env.get_discrete_state()

            # Bellman update
            best_future_q = np.max(q_table[next_s])
            current_q = q_table[s, action]
            q_table[s, action] = current_q + alpha * (reward + gamma * best_future_q - current_q)

            s = next_s
            ep_reward += reward
            final_info = info

        # Decay exploration
        epsilon = max(epsilon_min, epsilon * decay_rate)

        episode_rewards.append(round(float(ep_reward), 2))
        backlog_history.append(float(final_info.get("waiting_units", 0.0)))
        battery_history.append(round(float(final_info.get("avg_battery", 0.0) / 100.0), 3))
        same_day_history.append(round(float(final_info.get("same_day_pct", 0.0)), 2))
        km_history.append(round(float(final_info.get("robot_km", 0.0)), 2))

        if (ep + 1) % 100 == 0 or ep == episodes - 1:
            avg_rew_100 = np.mean(episode_rewards[-100:])
            avg_sla_100 = np.mean(same_day_history[-100:])
            print(
                f"Episode {ep+1:3d}/{episodes} | Avg Reward: {avg_rew_100:6.2f} "
                f"| SLA Same-Day: {avg_sla_100:5.1f}% | Epsilon: {epsilon:.3f}"
            )

    # Evaluate baselines on identical evaluation seeds
    print("\n[INFO] Evaluating baseline heuristics for comparative benchmarking...")
    fifo_baseline = evaluate_heuristic_baseline(env, policy_type="fifo", num_episodes=50)
    batching_baseline = evaluate_heuristic_baseline(env, policy_type="batching", num_episodes=50)

    print(f"       FIFO Baseline SLA:     {fifo_baseline['same_day_pct']:.1f}% | Avg Reward: {fifo_baseline['avg_reward']:.2f}")
    print(f"       Batching Baseline SLA: {batching_baseline['same_day_pct']:.1f}% | Avg Reward: {batching_baseline['avg_reward']:.2f}")
    print(f"       Q-Learning Final SLA:  {np.mean(same_day_history[-50:]):.1f}% | Avg Reward: {np.mean(episode_rewards[-50:]):.2f}")

    out_dir = Path(__file__).resolve().parent

    # 1. Export q_table.npy (for Python runtime & reloading)
    npy_path = out_dir / "q_table.npy"
    np.save(str(npy_path), q_table)

    # 2. Export q_table.csv (for direct AnyLogic model import with rlLoadQTable)
    csv_path = out_dir / "q_table.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("state,wait,send_one,send_all,charge\n")
        for s_idx in range(num_states):
            row_vals = [f"{q_table[s_idx, a]:.4f}" for a in range(num_actions)]
            f.write(f"{s_idx}," + ",".join(row_vals) + "\n")

    # Also copy to anylogic_model/exports/q_table.csv so AnyLogic finds it
    anylogic_export_path = out_dir.parent / "anylogic_model" / "exports" / "q_table.csv"
    if anylogic_export_path.parent.exists():
        with open(anylogic_export_path, "w", encoding="utf-8") as f:
            f.write("state,wait,send_one,send_all,charge\n")
            for s_idx in range(num_states):
                row_vals = [f"{q_table[s_idx, a]:.4f}" for a in range(num_actions)]
                f.write(f"{s_idx}," + ",".join(row_vals) + "\n")

    # 3. Export q_learning_results.json adhering to docs/API_CONTRACT.md
    results = {
        # 6 Mandatory top-level keys
        "algorithm": "Q-Learning (Tabular 288-State)",
        "episodes": episodes,
        "final_avg_reward": float(np.mean(episode_rewards[-50:])),
        "rewards_sample": episode_rewards[::3],  # downsample for clean charts
        "avg_battery_end": float(np.mean(battery_history[-50:])),
        "avg_backlog_end": float(np.mean(backlog_history[-50:])),

        # Option 2 Campus Courier metrics
        "same_day_pct": float(np.mean(same_day_history[-50:])),
        "robot_km": float(np.mean(km_history[-50:])),
        "episode_rewards": episode_rewards,
        "same_day_history": same_day_history,
        "backlog_history": backlog_history,
        "baseline_comparison": {
            "fifo": fifo_baseline,
            "batching": batching_baseline,
            "q_learning": {
                "avg_reward": float(np.mean(episode_rewards[-50:])),
                "same_day_pct": float(np.mean(same_day_history[-50:])),
                "avg_backlog": float(np.mean(backlog_history[-50:])),
                "avg_battery": float(np.mean(battery_history[-50:])),
                "avg_km": float(np.mean(km_history[-50:])),
            },
        },
    }

    json_path = out_dir / "q_learning_results.json"
    json_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print(f"\n[DONE] Q-Learning training and evaluation completed!")
    print(f"       Saved Q-Table (NPY): {npy_path}")
    print(f"       Saved Q-Table (CSV): {csv_path}")
    print(f"       Saved JSON metrics:  {json_path}")
    return results


if __name__ == "__main__":
    train_q_learning()
