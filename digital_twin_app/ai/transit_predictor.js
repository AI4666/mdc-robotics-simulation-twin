/**
 * transit_predictor.js — Supervised ML Regression & Predictive Latency Engine
 * 
 * Course Reference: CAI 4510C — Machine Intelligence (Miami Dade College)
 * Based on: "Autonomous Campus Delivery Fleet Optimization: Supervised Regression Baseline & Rational Agent Planning"
 * 
 * Performance Metrics (from paper Table 2):
 *  - R² Score: 0.9838 (captures 98.38% of delivery time variance)
 *  - MAE: 0.3412 min (~20.5 seconds)
 *  - RMSE: 0.4276 min (~25.6 seconds)
 *  - MAPE: 4.87%
 */

// Dataset normalization statistics (N = 2,500 simulated missions, Table 1)
const FEATURE_STATS = {
  astar_path_len:           { mean: 13.050, std: 7.061 },
  manhattan_dist:           { mean: 11.380, std: 6.798 },
  num_turns:                { mean: 3.322,  std: 2.452 },
  detour_ratio:             { mean: 1.205,  std: 0.217 },
  payload_weight_kg:        { mean: 4.501,  std: 2.138 },
  pedestrian_traffic_index: { mean: 0.489,  std: 0.221 },
  battery_start_pct:        { mean: 65.265, std: 19.855 },
  time_of_day_hour:         { mean: 13.030, std: 2.861 },
  actual_delivery_time_min: { mean: 8.219,  std: 3.298 },
  energy_consumed_wh:       { mean: 29.623, std: 15.258 }
};

// Standardized OLS regression weights (beta coefficients, Section 4)
const BETA_COEFFICIENTS = {
  astar_path_len:           +2.8916,  // Primary driver of transit delay
  weather_rain:             +2.2725,  // Surface wetness & safety speed governor
  weather_overcast:         +0.4500,  // Minor visibility / ambient friction
  pedestrian_traffic_index: +0.8405,  // Dynamic crowd slowing and yielding
  payload_weight_kg:        +0.3200,  // Braking inertia & acceleration lag
  num_turns:                +0.2850,  // Deceleration into 90-degree corners
  robot_beta_v2:            -0.6243,  // Hardware efficiency bonus (Bot_Beta / Logistics)
  robot_g1_humanoid:        +0.3500,  // Bipedal gait pace differential
  intercept:                0.0285    // Residual offset near zero
};

class TransitPredictor {
  /**
   * Standardize a scalar value to zero mean and unit variance: z = (x - μ) / σ
   */
  static standardize(featureName, value) {
    const stat = FEATURE_STATS[featureName];
    if (!stat || stat.std === 0) return 0;
    return (value - stat.mean) / stat.std;
  }

  /**
   * Predicts delivery transit time (minutes) and energy consumption (Wh)
   * @param {Object} missionParams
   *  - astar_path_len {number}
   *  - num_turns {number}
   *  - manhattan_dist {number}
   *  - detour_ratio {number}
   *  - payload_weight_kg {number} [0.5 - 12.5]
   *  - pedestrian_traffic_index {number} [0.0 - 1.0]
   *  - weather_condition {string} 'Clear' | 'Overcast' | 'Rain'
   *  - robot_model {string} 'AMR-01' | 'AMR-02' | 'AMR-03' | 'HUM-01' | 'UAV-01'
   *  - battery_start_pct {number} [20 - 100]
   *  - time_of_day_hour {number} [8 - 18]
   * @returns {Object} Prediction results with explainable feature contributions
   */
  static predict(missionParams = {}) {
    const pathLen = missionParams.astar_path_len || 13.0;
    const turns = missionParams.num_turns !== undefined ? missionParams.num_turns : 3;
    const payload = missionParams.payload_weight_kg !== undefined ? missionParams.payload_weight_kg : 4.5;
    const traffic = missionParams.pedestrian_traffic_index !== undefined ? missionParams.pedestrian_traffic_index : 0.48;
    const weather = missionParams.weather_condition || 'Clear';
    const robot = missionParams.robot_model || 'AMR-01';
    const batteryStart = missionParams.battery_start_pct !== undefined ? missionParams.battery_start_pct : 85.0;

    // Standardized z-scores
    const zPath = this.standardize('astar_path_len', pathLen);
    const zTurns = this.standardize('num_turns', turns);
    const zPayload = this.standardize('payload_weight_kg', payload);
    const zTraffic = this.standardize('pedestrian_traffic_index', traffic);

    // Weather dummy encoding
    const isRain = (weather.toLowerCase() === 'rain') ? 1.0 : 0.0;
    const isOvercast = (weather.toLowerCase() === 'overcast') ? 1.0 : 0.0;

    // Robot model encoding
    const isBeta = (robot === 'AMR-02' || robot.toLowerCase().includes('beta')) ? 1.0 : 0.0;
    const isHumanoid = (robot === 'HUM-01' || robot.toLowerCase().includes('humanoid') || robot.toLowerCase().includes('g1')) ? 1.0 : 0.0;

    // Compute standardized latent response: z_y = sum(beta_j * z_j)
    const deltaPath = BETA_COEFFICIENTS.astar_path_len * zPath;
    const deltaRain = BETA_COEFFICIENTS.weather_rain * isRain;
    const deltaOvercast = BETA_COEFFICIENTS.weather_overcast * isOvercast;
    const deltaTraffic = BETA_COEFFICIENTS.pedestrian_traffic_index * zTraffic;
    const deltaPayload = BETA_COEFFICIENTS.payload_weight_kg * zPayload;
    const deltaTurns = BETA_COEFFICIENTS.num_turns * zTurns;
    const deltaBeta = BETA_COEFFICIENTS.robot_beta_v2 * isBeta;
    const deltaHumanoid = BETA_COEFFICIENTS.robot_g1_humanoid * isHumanoid;

    const zPredicted = BETA_COEFFICIENTS.intercept +
      deltaPath +
      deltaRain +
      deltaOvercast +
      deltaTraffic +
      deltaPayload +
      deltaTurns +
      deltaBeta +
      deltaHumanoid;

    // Unstandardize predicted delivery time (minutes)
    const targetMean = FEATURE_STATS.actual_delivery_time_min.mean;
    const targetStd = FEATURE_STATS.actual_delivery_time_min.std;
    let predictedTimeMin = targetMean + (zPredicted * targetStd);
    
    // Physical lower clamp based on kinematic limits
    predictedTimeMin = Math.max(1.5, Number(predictedTimeMin.toFixed(2)));

    // Energy consumption prediction (Wh)
    // Highly correlated with path length (r = 0.97) and payload inertia
    const energyBase = FEATURE_STATS.energy_consumed_wh.mean;
    const energyStd = FEATURE_STATS.energy_consumed_wh.std;
    const zEnergy = (0.92 * zPath) + (0.16 * zPayload) + (0.10 * zTurns) + (0.12 * isRain);
    let predictedEnergyWh = Math.max(3.0, Number((energyBase + (zEnergy * energyStd)).toFixed(2)));

    // Recommended schedule buffer (95% prediction interval: t + 1.96 * RMSE)
    const rmse = 0.4276;
    const recommendedBufferMin = Number((predictedTimeMin + (1.96 * rmse)).toFixed(2));

    // Explainable AI (XAI) feature attribution breakdown (in minutes)
    const featureContributions = {
      base_nominal_min: Number(targetMean.toFixed(2)),
      path_length_delta_min: Number((deltaPath * targetStd).toFixed(2)),
      weather_delta_min: Number(((deltaRain + deltaOvercast) * targetStd).toFixed(2)),
      pedestrian_traffic_delta_min: Number((deltaTraffic * targetStd).toFixed(2)),
      payload_weight_delta_min: Number((deltaPayload * targetStd).toFixed(2)),
      turns_cornering_delta_min: Number((deltaTurns * targetStd).toFixed(2)),
      vehicle_efficiency_delta_min: Number(((deltaBeta + deltaHumanoid) * targetStd).toFixed(2))
    };

    return {
      predicted_delivery_time_min: predictedTimeMin,
      predicted_energy_wh: predictedEnergyWh,
      recommended_buffer_min: recommendedBufferMin,
      feature_contributions: featureContributions,
      model_metadata: {
        architecture: 'Ordinary Least Squares (OLS) Multiple Linear Regression',
        r2_score: 0.9838,
        mae_min: 0.3412,
        rmse_min: 0.4276
      }
    };
  }
}

// Support CommonJS & ES Module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TransitPredictor, FEATURE_STATS, BETA_COEFFICIENTS };
}
