export const RISK_LEVELS = ["lav", "middels", "hoy"];
export const RISK_RANK = { lav: 0, middels: 1, hoy: 2 };
export const RISK_LABEL = { lav: "LAV", middels: "MIDDELS", hoy: "HØY" };
export const RISK_MESSAGE = {
  lav: "Trygt — fortsett med forholdsregler",
  middels: "Følg med — vær ekstra oppmerksom",
  hoy: "Vurder å avbryte",
};

export function overallRisk(categoryLevels) {
  let rank = 0;
  for (const level of categoryLevels) {
    if (level == null) continue;
    rank = Math.max(rank, RISK_RANK[level] ?? 0);
  }
  return { level: RISK_LEVELS[rank], rank };
}