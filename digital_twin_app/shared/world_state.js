// world_state.js — rebuilds the server's world state from WORLD_STATE messages produced by
// ai/state_aggregator.js. Used by the browser (public/app.js) and by tests.
//
// data: { seq, reset, complete, robots?: { id: fields | null }, stations?: { key: fields | null } }
//   reset     clear everything first (a snapshot)
//   fields    merged into what is already known for that entity; null removes the entity
//   complete  false while the 8 KB budget is still holding back some changes
export function createWorldStateMirror() {
  let robots = {};
  let stations = {};
  let info = { seq: null, complete: false, resets: 0, messages: 0, receivedAt: null };

  function applySection(target, patch) {
    for (const [id, fields] of Object.entries(patch || {})) {
      if (fields === null) delete target[id];
      else target[id] = { ...(target[id] || {}), ...fields };
    }
  }

  return {
    apply(data, receivedAt = Date.now()) {
      if (data.reset) {
        robots = {};
        stations = {};
        info.resets++;
      }
      applySection(robots, data.robots);
      applySection(stations, data.stations);
      info = { ...info, seq: data.seq, complete: !!data.complete, messages: info.messages + 1, receivedAt };
    },
    get() {
      return { ...info, robots: structuredClone(robots), stations: structuredClone(stations) };
    }
  };
}
