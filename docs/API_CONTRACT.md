# Integration API & Data Contract

This document defines the exact runtime interfaces connecting the four components of **MDC Robotics Simulation Twin** (Issues `#1`–`#4` and the Signal Flow links).

---

## 1. Bridge 1: AnyLogic 8 -> 3D Digital Twin (`Issue #1`)

* **Endpoint:** `POST http://localhost:3000/api/anylogic/update`
* **Headers:** `Content-Type: application/json`

### Valid Fleet IDs (Case-Sensitive)
`digital_twin_app/world_model.js` matches incoming updates strictly with `r.id === updatedRobot.id`. Sending lowercase or mismatched IDs (e.g., `"amr01"`) creates duplicate ghost entries instead of updating existing 3D robots.

| Category | Valid IDs | Default `y` (Height) |
| :--- | :--- | :--- |
| Ground AMRs | `AMR-01`, `AMR-02`, `AMR-03`, `AMR-04`, `AMR-05`, `AMR-06` | `0.05` |
| Humanoid | `HUM-01` | `0.05` |
| Aerial Drones | `UAV-01`, `UAV-02`, `UAV-03` | `1.9` – `3.1` |

### 3D Coordinate Axes
* Horizontal floor plane: **`x`** (left/right) and **`z`** (front/back)
* Vertical height: **`y`** (`0.05` for ground units, `1.9`+ for drones)

### Reference Station & Dock Coordinates (`world_model.js`)

| Key | Name | Campus OSM (`mdc_north_campus_osm.glb`) `(x, y, z)` | Classroom (`robotics_lab.glb`) `(x, y, z)` |
| :--- | :--- | :--- | :--- |
| `inventory` | Station A: Parts Shelf | `(-0.20, 0.05, -1.30)` | `(-2.30, 0.05, -1.30)` |
| `electronics` | Station B: Electronics Bench | `(-3.50, 0.05, 0.40)` | `(-2.30, 0.05, 1.20)` |
| `testing` | Station C: Testing Table | `(2.20, 0.05, -0.05)` | `(2.20, 0.05, -1.30)` |
| `charger` | Station D: AMR Charger Dock | `(0.80, 0.05, 1.32)` | `(2.20, 0.05, 1.20)` |
| `helipad` | Station E: Drone Helipad | `(-2.55, 0.05, 1.32)` | `(0.00, 0.05, 0.00)` |
| `dock1` (`AMR-01`) | Bay 1: AMR-01 Dock | `(0.30, 0.05, 1.30)` | `(-1.50, 0.05, -1.35)` |
| `dock2` (`AMR-02`) | Bay 2: AMR-02 Dock | `(0.60, 0.05, 1.30)` | `(-0.90, 0.05, -1.35)` |
| `dock3` (`AMR-03`) | Bay 3: AMR-03 Dock | `(0.90, 0.05, 1.30)` | `(0.90, 0.05, -1.35)` |
| `dock4` (`AMR-04`) | Bay 4: AMR-04 Dock | `(1.20, 0.05, 1.30)` | `(1.50, 0.05, -1.35)` |
| `dock5` (`AMR-05`) | Bay 5: AMR-05 Dock | `(1.50, 0.05, 1.30)` | `(1.40, 0.05, 1.25)` |
| `dock6` (`AMR-06`) | Bay 6: AMR-06 Dock | `(1.80, 0.05, 1.30)` | `(2.20, 0.05, 1.25)` |

### JSON Request & Response

```json
{
  "source": "AnyLogic",
  "robots": [
    {
      "id": "AMR-01",
      "x": 0.30,
      "y": 0.05,
      "z": 1.30,
      "heading": 0,
      "status": "Delivering",
      "battery": 86,
      "speed": 1.2
    }
  ]
}
```

Expected response:
```json
{ "success": true, "count": 10 }
```

### Minimal Java 11+ Snippet (AnyLogic Periodic Event)

```java
String payload = String.format(
    java.util.Locale.US,
    "{\"source\":\"AnyLogic\",\"robots\":[{\"id\":\"AMR-01\",\"x\":%.3f,\"y\":0.05,\"z\":%.3f,\"heading\":%.1f,\"status\":\"%s\",\"battery\":%.1f,\"speed\":%.2f}]}",
    xCoord, zCoord, headingDeg, statusText, batteryPct, speedMps
);
java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
    .uri(java.net.URI.create("http://localhost:3000/api/anylogic/update"))
    .header("Content-Type", "application/json")
    .timeout(java.time.Duration.ofSeconds(2))
    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(payload))
    .build();
java.net.http.HttpClient.newHttpClient()
    .sendAsync(req, java.net.http.HttpResponse.BodyHandlers.discarding());
```

---

## 2. Bridge 2: 3D Digital Twin -> Streamlit Dashboard (`Issue #3`)

* **Fleet Telemetry:** `GET http://localhost:3000/api/robots`
* **Stations:** `GET http://localhost:3000/api/stations`

Response schema for `GET /api/robots`:
```json
{
  "robots": [
    {
      "id": "AMR-01",
      "name": "Inspector Alpha",
      "type": "amr",
      "x": -1.5,
      "y": 0.05,
      "z": -1.35,
      "heading": 0,
      "status": "Docked at Bay 1 (Standby)",
      "battery": 100,
      "speed": 0.0
    }
  ]
}
```

*Dashboard guidance:* Wrap HTTP polling in `try/except` with a short timeout (e.g., `timeout=2`) and render an offline fallback notice if `localhost:3000` is not running.

---

## 3. Bridge 3: RL Training Outputs -> Streamlit Dashboard (`Issues #2 & #3`)

* **Files:** `rl_models/ppo_results.json` and `rl_models/q_learning_results.json`

### Guaranteed Top-Level JSON Keys
```json
{
  "algorithm": "PPO (Proximal Policy Optimization)",
  "episodes": 600,
  "final_avg_reward": 519.37,
  "rewards_sample": [-854.0, -750.0, "..."],
  "avg_battery_end": 0.66486,
  "avg_backlog_end": 16.84
}
```

*Backward-compatibility rule:* When adding Option 2 Campus Courier metrics (such as `sla_compliance_pct` or `urgent_avg_wait_min`), preserve all six existing keys above so Dashboard Tab 2 continues to parse both files cleanly.

---

## 4. AnyLogic Experiment Exports (`Issues #1 & #3`)

* **Recommended Export Directory:** `anylogic_model/exports/` (`.csv` or `.json`)
* Export outputs from the 5 AnyLogic experiments (Optimization, Compare Runs, Monte Carlo, Sensitivity, Calibration) here so Streamlit Dashboard Tab 3 can read and plot real simulation runs.

---

## 5. Issue `#4` Integration QA & Mandatory Module 4 Checklist

### End-to-End 3-Bridge Verification Steps
1. Start the Digital Twin server (`npm start` in `digital_twin_app/`) on `http://localhost:3000`.
2. Trigger `POST /api/anylogic/update` from AnyLogic (or a test script) with valid fleet IDs (`AMR-01`..`AMR-06`, `HUM-01`, `UAV-01`..`UAV-03`) and verify robots update in the 3D scene and `/api/robots` without creating duplicate entries.
3. Run RL training (`python train_qlearning.py && python train_ppo.py` in `rl_models/`) and confirm `ppo_results.json` & `q_learning_results.json` preserve the schema above.
4. Start Streamlit (`streamlit run app.py` in `dashboard/`) on `http://localhost:8501` and verify Tab 2 loads the RL JSON results, Tab 3 loads AnyLogic exports (when present), and Tab 4 displays live `/api/robots` telemetry (plus clean offline fallback when port `3000` is stopped).

### Mandatory Individual Module 4 Lesson 1 (Stages 1–3) `.zip` Checklist
- [ ] Jorge A Mendoza
- [ ] Ricardo Molina Gonzalez
- [ ] Jordan Gonzalez
- [ ] Illia Shybanov
