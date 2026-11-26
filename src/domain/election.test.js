import test from "node:test";
import assert from "node:assert/strict";
import { buildStations, calculateDemand } from "./election.ts";

const row = (overrides = {}) => ({
  District: "Kohat", Tehsil: "Kohat", "Council Type (NC / VC)": "NC",
  "Council No": "1", "Council Name": "NC-1", "PS No": "1",
  "No & Name of Polling Station": "Station 1",
  "PS Type (Male / Female / Combined)": "Male",
  "Booths Male": 2, "Booths Female": 0,
  "Male Voters (block)": 100, "Female Voters (block)": 0,
  "Census Block Code": "001", ...overrides,
});

test("station aggregation groups census blocks and takes MAX booth counts", () => {
  const stations = buildStations([
    row({ "Census Block Code": "001", "Male Voters (block)": 100 }),
    row({ "Census Block Code": "002", "Booths Male": 2, "Male Voters (block)": 120 }),
  ]);
  assert.equal(stations.length, 1);
  assert.equal(stations[0].blockCount, 2);
  assert.equal(stations[0].boothsMale, 2);
  assert.equal(stations[0].maleVoters, 220);
});

test("station key separates tehsil, council and polling station number", () => {
  const stations = buildStations([
    row(), row({ "PS No": "2" }), row({ Tehsil: "Lachi" }),
  ]);
  assert.equal(stations.length, 3);
  assert.deepEqual(stations.map(s => s.tehsilStationNo), [1, 2, 1]);
  assert.deepEqual(stations.map(s => s.ncVcStationNo), [1, 2, 1]);
});

test("Male station demand matches legacy formula", () => {
  const [d] = calculateDemand(buildStations([row()]));
  assert.deepEqual(
    [d.presMale, d.srapoMale, d.apoMale, d.poMale, d.totalDemand, d.nqMale],
    [1, 1, 5, 2, 9, 0],
  );
});

test("Female station demand matches legacy formula", () => {
  const [d] = calculateDemand(buildStations([row({
    "PS Type (Male / Female / Combined)": "Female",
    "Booths Male": 0, "Booths Female": 2,
    "Male Voters (block)": 0, "Female Voters (block)": 90,
  })]));
  assert.deepEqual(
    [d.presFemale, d.srapoFemale, d.apoFemale, d.poFemale, d.totalDemand],
    [1, 1, 5, 2, 9],
  );
});

test("Combined station preserves legacy asymmetric APO calculation", () => {
  const [d] = calculateDemand(buildStations([row({
    "PS Type (Male / Female / Combined)": "Combined",
    "Booths Male": 2, "Booths Female": 2,
  })]));
  assert.deepEqual(
    [d.presMale, d.presFemale, d.srapoMale, d.srapoFemale, d.apoMale, d.apoFemale, d.poMale, d.poFemale, d.totalDemand],
    [1, 0, 1, 0, 5, 6, 2, 2, 17],
  );
});

test("missing tehsil rows are excluded as in legacy source", () => {
  assert.equal(buildStations([row({ Tehsil: "" })]).length, 0);
});

test("district demand rules override default staffing formulas", () => {
  const rules = [
    { "Duty Role": "Presiding Officer", "Station Type": "Male", "Required Gender": "Male", Basis: "Station", "Posts per Unit": "2", "Adjustment per Station": "" },
    { "Duty Role": "Senior Assistant Presiding Officer", "Station Type": "Male", "Required Gender": "Male", Basis: "Station", "Posts per Unit": "1", "Adjustment per Station": "" },
    { "Duty Role": "Assistant Presiding Officer", "Station Type": "Male", "Required Gender": "Male", Basis: "Male booth", "Posts per Unit": "2", "Adjustment per Station": "-1" },
    { "Duty Role": "Polling Officer", "Station Type": "Male", "Required Gender": "Male", Basis: "Male booth", "Posts per Unit": "1", "Adjustment per Station": "" },
  ];
  const [d] = calculateDemand(buildStations([row()]), rules);
  assert.deepEqual(
    [d.presMale, d.srapoMale, d.apoMale, d.poMale, d.totalDemand, d.nqMale],
    [2, 1, 3, 2, 8, 0],
  );
});
