let dronesPromise = null;

export function loadDrones() {
  if (!dronesPromise) {
    dronesPromise = fetch("./data/drones.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Kunne ikke laste data/drones.json (${r.status})`);
        return r.json();
      })
      .then((data) => data.drones ?? [])
      .catch((err) => {
        dronesPromise = null;
        throw err;
      });
  }
  return dronesPromise;
}

export async function findDrone(id) {
  const drones = await loadDrones();
  return drones.find((d) => d.id === id) ?? null;
}