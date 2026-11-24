"""
PPO (Proximal Policy Optimization) Training Script for MDC Campus Courier Simulation (Option 2).
Trains an Actor-Critic neural network policy with Stable-Baselines3, evaluates against baselines,
and exports serialized weights (ZIP & JSON for AnyLogic) and metrics for the Streamlit dashboard.

Assigned to: Jordan Gonzalez (RL Lead)
"""

import json
import sys
from pathlib import Path

# Ensure rl_models dir is on sys.path for direct or module execution
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from robotics_lab_env import MDCRoboticsLabEnv
from train_qlearning import evaluate_heuristic_baseline

try:
    import torch
    from stable_baselines3 import PPO
    from stable_baselines3.common.callbacks import BaseCallback
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False


class MetricsCallback(BaseCallback):
    """Logs episodic rewards and SLA metrics during PPO training."""

    def __init__(self, verbose=0):
        super().__init__(verbose)
        self.episode_rewards = []
        self.current_reward = 0.0

    def _on_step(self) -> bool:
        rewards = self.locals.get("rewards", [0.0])
        self.current_reward += sum(rewards)

        dones = self.locals.get("dones", [False])
        if any(dones):
            self.episode_rewards.append(float(self.current_reward))
            self.current_reward = 0.0
        return True


def export_ppo_weights_json(model, out_path: Path):
    """
    Exports policy neural network weights (layers & biases) into a portable JSON structure.
    Enables Ricardo to run the forward pass directly in AnyLogic's ppoAction() without Python!
    """
    try:
        policy_dict = {
            "observation_dim": 8,
            "action_dim": 4,
            "observation_features": [
                "waiting_units_norm (waiting_units / 15.0)",
                "free_rovers_fraction (free_count / 6.0)",
                "avg_fleet_battery (avg_batt / 100.0)",
                "min_fleet_battery (min_batt / 100.0)",
                "charger_occupancy (occupied_chargers / 2.0)",
                "time_of_day_fraction ((hour - 8.0) / 9.0)",
                "class_change_soon (1.0 if minute >= 40 else 0.0)",
                "total_unsorted_norm (unsorted / 50.0)",
            ],
            "observation_scaling": {
                "waiting_units_divisor": 15.0,
                "fleet_size": 6.0,
                "battery_divisor": 100.0,
                "charging_pads": 2.0,
                "start_hour": 8.0,
                "end_hour": 17.0,
                "soon_minute_threshold": 40.0,
                "unsorted_divisor": 50.0,
            },
            "layers": {},
        }
        for name, param in model.policy.named_parameters():
            if "action_net" in name or "mlp_extractor.policy_net" in name:
                clean_name = name.replace("mlp_extractor.policy_net.", "shared_").replace("action_net.", "action_head_")
                policy_dict["layers"][clean_name] = param.detach().cpu().numpy().tolist()

        out_path.write_text(json.dumps(policy_dict, indent=2), encoding="utf-8")
        print(f"       Exported portable PPO weights: {out_path}")

        # Also copy to anylogic_model/exports/ppo_policy.json for Ricardo
        anylogic_export = out_path.parent.parent / "anylogic_model" / "exports" / "ppo_policy.json"
        if anylogic_export.parent.exists():
            anylogic_export.write_text(json.dumps(policy_dict, indent=2), encoding="utf-8")
            print(f"       Exported copy to AnyLogic exports: {anylogic_export}")
    except Exception as e:
        print(f"[WARN] Could not export portable weights JSON: {e}")
    except Exception as e:
        print(f"[WARN] Could not export portable weights JSON: {e}")


def train_ppo(total_timesteps=54000):
    """
    Trains Deep RL PPO agent using Stable-Baselines3.
    54,000 timesteps = 500 simulated working days (108 steps per day).
    """
    out_dir = Path(__file__).resolve().parent
    env = MDCRoboticsLabEnv()

    print(f"[INFO] Initializing Stable-Baselines3 PPO Training...")
    print(f"       Total Timesteps: {total_timesteps} (~{total_timesteps // 108} simulated days)")
    print(f"       Observation Space: Box(8,) | Action Space: Discrete(4)")

    # Stable-Baselines3 Actor-Critic PPO Configuration
    model = PPO(
        "MlpPolicy",
        env,
        verbose=1,
        learning_rate=3e-4,
        n_steps=540,          # 5 full simulated days per policy update
        batch_size=64,
        n_epochs=10,
        gamma=0.98,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,         # Encourage exploration
        seed=42,
    )

    callback = MetricsCallback()
    model.learn(total_timesteps=total_timesteps, callback=callback)

    # 1. Save SB3 model archive
    model_zip_path = out_dir / "ppo_robotics_lab.zip"
    model.save(str(model_zip_path))
    print(f"\n[INFO] Saved PPO model weights: {model_zip_path}")

    # 2. Export portable JSON weights for AnyLogic
    export_ppo_weights_json(model, out_dir / "ppo_policy.json")

    # 3. Comprehensive Evaluation (50 days)
    print("\n[INFO] Evaluating trained PPO policy across 50 test episodes...")
    eval_rewards = []
    eval_backlogs = []
    eval_batteries = []
    eval_sla = []
    eval_kms = []

    for ep in range(50):
        obs, _ = env.reset(seed=5000 + ep)
        ep_rew = 0.0
        terminated = False
        info = {}

        while not terminated:
            action, _ = model.predict(obs, deterministic=True)
            obs, r, terminated, _, info = env.step(int(action))
            ep_rew += r

        eval_rewards.append(float(ep_rew))
        eval_backlogs.append(float(info.get("waiting_units", 0.0)))
        eval_batteries.append(float(info.get("avg_battery", 0.0) / 100.0))
        eval_sla.append(float(info.get("same_day_pct", 0.0)))
        eval_kms.append(float(info.get("robot_km", 0.0)))

    # Compare against baselines
    print("\n[INFO] Evaluating baseline heuristics for comparative benchmarking...")
    fifo_baseline = evaluate_heuristic_baseline(env, policy_type="fifo", num_episodes=50)
    batching_baseline = evaluate_heuristic_baseline(env, policy_type="batching", num_episodes=50)

    # Load Q-learning results if available for 3-way comparison
    q_results_file = out_dir / "q_learning_results.json"
    q_data = {}
    if q_results_file.exists():
        try:
            q_data = json.loads(q_results_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    print(f"       FIFO Baseline SLA:     {fifo_baseline['same_day_pct']:.1f}% | Avg Reward: {fifo_baseline['avg_reward']:.2f}")
    print(f"       Batching Baseline SLA: {batching_baseline['same_day_pct']:.1f}% | Avg Reward: {batching_baseline['avg_reward']:.2f}")
    print(f"       PPO Evaluation SLA:    {np.mean(eval_sla):.1f}% | Avg Reward: {np.mean(eval_rewards):.2f}")

    # 4. Export ppo_results.json matching docs/API_CONTRACT.md
    results = {
        # 6 Mandatory top-level keys
        "algorithm": "PPO (Stable-Baselines3 MlpPolicy)",
        "episodes": total_timesteps // 108,
        "final_avg_reward": float(np.mean(eval_rewards)),
        "rewards_sample": [round(float(r), 2) for r in eval_rewards],
        "avg_battery_end": float(np.mean(eval_batteries)),
        "avg_backlog_end": float(np.mean(eval_backlogs)),

        # Option 2 Extended Metrics
        "same_day_pct": float(np.mean(eval_sla)),
        "robot_km": float(np.mean(eval_kms)),
        "episode_rewards": eval_rewards,
        "baseline_comparison": {
            "fifo": fifo_baseline,
            "batching": batching_baseline,
            "q_learning": q_data.get("baseline_comparison", {}).get("q_learning", {}),
            "ppo": {
                "avg_reward": float(np.mean(eval_rewards)),
                "same_day_pct": float(np.mean(eval_sla)),
                "avg_backlog": float(np.mean(eval_backlogs)),
                "avg_battery": float(np.mean(eval_batteries)),
                "avg_km": float(np.mean(eval_kms)),
            },
        },
    }

    results_path = out_dir / "ppo_results.json"
    results_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"       Exported JSON metrics: {results_path}")
    print("\n[DONE] PPO training, benchmarking, and export complete!")
    return results


def main():
    if not SB3_AVAILABLE:
        print("[ERROR] Stable-Baselines3 is not available. Please activate .venv.")
        return
    train_ppo()


if __name__ == "__main__":
    main()
