export type Gender = "Male" | "Female";
export type PollingStationType = "Male" | "Female" | "Combined" | string;

export interface DataRow {
  District?: unknown;
  Tehsil?: unknown;
  "Council Type (NC / VC)"?: unknown;
  "Council No"?: unknown;
  "Council Name"?: unknown;
  "PS No"?: unknown;
  "NC/VC PS No"?: unknown;
  "Tehsil PS No"?: unknown;
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
  sourceTehsilPsNo: string;
  sourceNcVcPsNo: string;
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
        councilName: str(row["Council Name"]), psNo, sourceTehsilPsNo: str(row["Tehsil PS No"]), sourceNcVcPsNo: str(row["NC/VC PS No"]),
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
    const tehsilStationNo = num(station.sourceTehsilPsNo) || (tehsilCounters.get(tKey) ?? 0) + 1;
    const ncVcStationNo = num(station.sourceNcVcPsNo) || num(station.psNo) || (councilCounters.get(cKey) ?? 0) + 1;
    tehsilCounters.set(tKey, tehsilStationNo);
    councilCounters.set(cKey, ncVcStationNo);
    return {
      ...station, sNo: index + 1, tehsilStationNo, ncVcStationNo,
      tehsilPollingStationNo: tehsilStationNo, ncVcPollingStationNo: ncVcStationNo,
    };
  });
}

/**
 * Mirrors the legacy calcDemand() rules. If district rules are supplied, they
 * are authoritative; otherwise the audited legacy defaults are used.
 * Naib Qasid remains excluded, matching the original app's allocation policy.
 */
export function calculateDemand(stations: Station[], rules: any[] = []): DemandStation[] {
  const normalizedRules = rules.map((r) => Array.isArray(r) ? {
    role: str(r[0]), stationType: str(r[1]), gender: str(r[2]), basis: str(r[3]),
    perUnit: num(r[4]), adjustment: r[5] === "" || r[5] == null ? 0 : num(r[5]),
  } : {
    role: str(r["Duty Role"] ?? r.role), stationType: str(r["Station Type"] ?? r.station_type),
    gender: str(r["Required Gender"] ?? r.gender), basis: str(r.Basis ?? r.basis),
    perUnit: num(r["Posts per Unit"] ?? r.per_unit),
    adjustment: r["Adjustment per Station"] === "" || r["Adjustment per Station"] == null
      ? (r.adjustment == null ? 0 : num(r.adjustment))
      : num(r["Adjustment per Station"]),
  }).filter((r) => r.role && r.stationType && r.gender);

  const ruleAliases: Record<string, string[]> = {
    "Presiding Officer": ["presiding officer", "presiding"],
    "Senior APO": ["senior assistant presiding officer", "senior apo", "srapo"],
    "APO": ["assistant presiding officer", "apo"],
    "Polling Officer": ["polling officer", "po"],
  };
  const fromRules = (station: Station, role: string, gender: string): number => {
    const aliases = ruleAliases[role] || [role.toLowerCase()];
    const rule = normalizedRules.find((r) =>
      aliases.includes(r.role.toLowerCase()) &&
      r.stationType.toLowerCase() === station.psType.toLowerCase() &&
      r.gender.toLowerCase() === gender.toLowerCase()
    );
    if (!rule) return 0;
    const basis = rule.basis.toLowerCase();
    const units = basis === "station" ? 1
      : basis === "male booth" ? station.boothsMale
      : basis === "female booth" ? station.boothsFemale : 0;
    return Math.max(0, Math.round(rule.perUnit * units + rule.adjustment));
  };

  return stations.map((station) => {
    let presMale: number, presFemale: number, srapoMale: number, srapoFemale: number;
    let apoMale: number, apoFemale: number, poMale: number, poFemale: number;
    if (normalizedRules.length) {
      presMale = fromRules(station, "Presiding Officer", "Male");
      presFemale = fromRules(station, "Presiding Officer", "Female");
      srapoMale = fromRules(station, "Senior APO", "Male");
      srapoFemale = fromRules(station, "Senior APO", "Female");
      apoMale = fromRules(station, "APO", "Male");
      apoFemale = fromRules(station, "APO", "Female");
      poMale = fromRules(station, "Polling Officer", "Male");
      poFemale = fromRules(station, "Polling Officer", "Female");
    } else {
      const isMale = station.psType === "Male";
      const isFemale = station.psType === "Female";
      const isCombined = station.psType === "Combined";
      presMale = isMale || isCombined ? 1 : 0;
      presFemale = isFemale ? 1 : 0;
      srapoMale = isMale || isCombined ? 1 : 0;
      srapoFemale = isFemale ? 1 : 0;
      apoMale = isMale || isCombined ? Math.max(0, 3 * station.boothsMale - 1) : 0;
      apoFemale = isFemale ? Math.max(0, 3 * station.boothsFemale - 1) : isCombined ? 3 * station.boothsFemale : 0;
      poMale = isMale || isCombined ? station.boothsMale : 0;
      poFemale = isFemale || isCombined ? station.boothsFemale : 0;
    }
    const nqMale = 0 as const;
    const nqFemale = 0 as const;
    const totalDemand = presMale + presFemale + srapoMale + srapoFemale + apoMale + apoFemale + poMale + poFemale;
    return { ...station, presMale, presFemale, srapoMale, srapoFemale, apoMale, apoFemale, poMale, poFemale, nqMale, nqFemale, totalDemand };
  });
}
