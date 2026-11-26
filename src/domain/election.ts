export type Gender = "Male" | "Female";
export type PollingStationType = "Male" | "Female" | "Combined" | string;

export interface DataRow {
  District?: unknown;
  Tehsil?: unknown;
  "Council Type (NC / VC)"?: unknown;
  "Council No"?: unknown;
  "Council Name"?: unknown;
  "PS No"?: unknown;\n  "NC/VC PS No"?: unknown;\n  "Tehsil PS No"?: unknown;
  "No & Name of Polling Station"?: unknown;
  "PS Type (Male / Female / Combined)"?: unknown;
  "Booths Male"?: unknown;
  "Booths Female"?: unknown;
  "Male Voters (block)"?: unknown;
  "Female Voters (block)"?: unknown;
  "Census Block Code"?: unknown;
  [key: string]: unknown;
}

export interface Station {
  sNo: number;
  district: string;
  tehsil: string;
  councilType: string;
  councilNo: string;
  councilName: string;
  psNo: string;
  stationName: string;
  psType: PollingStationType;
  boothsMale: number;
  boothsFemale: number;
  maleVoters: number;
  femaleVoters: number;
  blockCount: number;
  blocks: unknown[];
  tehsilStationNo: number;
  ncVcStationNo: number;
  tehsilPollingStationNo: number;
  ncVcPollingStationNo: number;
}

export interface DemandStation extends Station {
  presMale: number;
  presFemale: number;
  srapoMale: number;
  srapoFemale: number;
  apoMale: number;
  apoFemale: number;
  poMale: number;
  poFemale: number;
  nqMale: 0;
  nqFemale: 0;
  totalDemand: number;
}

const str = (value: unknown): string => String(value ?? "").trim();
const num = (value: unknown): number => {
  if (value === null || value === undefined || str(value) === "") return 0;
  const parsed = Number(str(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Mirrors the audited legacy station key and aggregation rules. */
export function buildStations(dataRows: DataRow[]): Station[] {
  const map = new Map<string, Omit<Station, "sNo" | "tehsilStationNo" | "ncVcStationNo" | "tehsilPollingStationNo" | "ncVcPollingStationNo">>();
  for (const row of dataRows) {
    const tehsil = str(row.Tehsil);
    if (!tehsil) continue;
    const councilType = str(row["Council Type (NC / VC)"]);
    const councilNo = str(row["Council No"]);
    const psNo = str(row["PS No"]);
    const key = [tehsil, councilType, councilNo, psNo].join("|");
    if (!map.has(key)) {
      map.set(key, {
        district: str(row.District), tehsil, councilType, councilNo,
        councilName: str(row["Council Name"]), psNo,
        stationName: str(row["No & Name of Polling Station"]),
        psType: str(row["PS Type (Male / Female / Combined)"]),
        boothsMale: 0, boothsFemale: 0, maleVoters: 0, femaleVoters: 0,
        blockCount: 0, blocks: [],
      });
    }
    const station = map.get(key)!;
    station.boothsMale = Math.max(station.boothsMale, num(row["Booths Male"]));
    station.boothsFemale = Math.max(station.boothsFemale, num(row["Booths Female"]));
    const type = station.psType;
    if (type === "Male" || type === "Combined") station.maleVoters += num(row["Male Voters (block)"]);
    if (type === "Female" || type === "Combined") station.femaleVoters += num(row["Female Voters (block)"]);
    station.blockCount += 1;
    station.blocks.push(row["Census Block Code"]);
  }

  const stations = [...map.values()];
  const tehsilCounters = new Map<string, number>();
  const councilCounters = new Map<string, number>();
  return stations.map((station, index) => {
    const tKey = station.tehsil.trim().toLowerCase();
    const cKey = `${tKey}|${station.councilType.trim().toUpperCase()}|${station.councilNo.trim().toLowerCase()}`;
    const tehsilStationNo = (tehsilCounters.get(tKey) ?? 0) + 1;
    const ncVcStationNo = (councilCounters.get(cKey) ?? 0) + 1;
    tehsilCounters.set(tKey, tehsilStationNo);
    councilCounters.set(cKey, ncVcStationNo);
    return {
      ...station, sNo: index + 1, tehsilStationNo, ncVcStationNo,
      tehsilPollingStationNo: tehsilStationNo, ncVcPollingStationNo: ncVcStationNo,
    };
  });
}

/**
 * Mirrors calcDemand() in the audited legacy source.
 * IMPORTANT: Combined-station female APO uses 3 × female booths (no -1).
 * Naib Qasid demand is deliberately zero in the audited source.
 */
export function calculateDemand(stations: Station[]): DemandStation[] {
  return stations.map((station) => {
    const isMale = station.psType === "Male";
    const isFemale = station.psType === "Female";
    const isCombined = station.psType === "Combined";
    const presMale = isMale || isCombined ? 1 : 0;
    const presFemale = isFemale ? 1 : 0;
    const srapoMale = isMale || isCombined ? 1 : 0;
    const srapoFemale = isFemale ? 1 : 0;
    const apoMale = isMale || isCombined ? Math.max(0, 3 * station.boothsMale - 1) : 0;
    const apoFemale = isFemale ? Math.max(0, 3 * station.boothsFemale - 1) : isCombined ? 3 * station.boothsFemale : 0;
    const poMale = isMale || isCombined ? station.boothsMale : 0;
    const poFemale = isFemale || isCombined ? station.boothsFemale : 0;
    const nqMale = 0 as const;
    const nqFemale = 0 as const;
    const totalDemand = presMale + presFemale + srapoMale + srapoFemale + apoMale + apoFemale + poMale + poFemale;
    return { ...station, presMale, presFemale, srapoMale, srapoFemale, apoMale, apoFemale, poMale, poFemale, nqMale, nqFemale, totalDemand };
  });
}
