let thresholdsPromise = null;

export function loadThresholds() {
  if (!thresholdsPromise) {
    thresholdsPromise = fetch("./data/thresholds.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Kunne ikke laste data/thresholds.json (${r.status})`);
        return r.json();
      })
      .catch((err) => {
        thresholdsPromise = null;
        throw err;
      });
  }
  return thresholdsPromise;
}