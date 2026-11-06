"""
Q-Learning Training Script for MDC Robotics Lab Simulation
Trains a discretized Q-Learning agent, evaluates performance, and exports episode metrics.
Assigned to: Jordan Gonzalez (RL Lead)
"""

import json
from pathlib import Path
import numpy as np
from robotics_lab_env import MDCRoboticsLabEnv


def discretize_state(obs):
    """
    Discretizes continuous observation space into discrete indices for tabular Q-learning.
    Obs: [qA, qB, qC, b1, b2, b3, docks, phase]
    """
    q_total = min(4, int((obs[0] + obs[1] + obs[2]) // 4))  # 0 to 4
    min_bat = min(obs[3], obs[4], obs[5])
    bat_bin = 0 if min_bat < 0.25 else (1 if min_bat < 0.65 else 2)  # Low, Med, High
    docks = min(1, int(obs[6]))  # 0 or 1+
    return (q_total, bat_bin, docks)


def train_q_learning(episodes=600, alpha=0.1, gamma=0.95, epsilon_start=1.0, epsilon_min=0.05, decay_rate=0.995):
    env = MDCRoboticsLabEnv()
    num_actions = env.action_space.n

    # Q-table dimensions: (q_bins=5, bat_bins=3, dock_bins=2, actions=5)
    q_table = np.zeros((5, 3, 2, num_actions), dtype=np.float32)

    episode_rewards = []
    backlog_history = []
    battery_history = []
    epsilon = epsilon_start

    print(f"Starting Q-Learning Training across {episodes} episodes...")

    for ep in range(episodes):
        obs, _ = env.reset(seed=ep)
        state_idx = discretize_state(obs)
        total_reward = 0.0
        final_info = {}

        terminated = False
        while not terminated:
            # Epsilon-greedy action selection
            if np.random.random() < epsilon:
                action = env.action_space.sample()
            else:
                action = int(np.argmax(q_table[state_idx]))

            next_obs, reward, terminated, truncated, info = env.step(action)
            next_state_idx = discretize_state(next_obs)

            # Q-learning Bellman update
            best_future_q = np.max(q_table[next_state_idx])
            current_q = q_table[state_idx][action]
            q_table[state_idx][action] = current_q + alpha * (reward + gamma * best_future_q - current_q)

            state_idx = next_state_idx
            total_reward += reward
            final_info = info

        # Decay epsilon
        epsilon = max(epsilon_min, epsilon * decay_rate)

        episode_rewards.append(round(float(total_reward), 2))
        backlog_history.append(float(final_info.get("total_backlog", 0)))
        battery_history.append(round(float(final_info.get("avg_battery", 0)), 3))

        if (ep + 1) % 100 == 0:
            avg_last_100 = np.mean(episode_rewards[-100:])
            print(f"Episode {ep+1:3d}/{episodes} | Avg Reward: {avg_last_100:6.2f} | Epsilon: {epsilon:.3f}")

    # Export results for Streamlit
    out_dir = Path(__file__).resolve().parent
    results = {
        "algorithm": "Q-Learning",
        "episodes": episodes,
        "final_avg_reward": float(np.mean(episode_rewards[-50:])),
        "rewards_sample": episode_rewards[::3],  # downsample for neat plotting
        "avg_battery_end": float(np.mean(battery_history[-50:])),
        "avg_backlog_end": float(np.mean(backlog_history[-50:])),
    }

    results_file = out_dir / "q_learning_results.json"
    results_file.write_text(json.dumps(results, indent=2), encoding="utf-8")
    np.save(str(out_dir / "q_table.npy"), q_table)

    print(f"\n[DONE] Q-Learning training finished.")
    print(f"Results saved to: {results_file}")
    print(f"Q-Table saved to: {out_dir / 'q_table.npy'}")


if __name__ == "__main__":
    train_q_learning()
