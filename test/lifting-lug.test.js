import test from "node:test";
import assert from "node:assert/strict";

import { calculateLiftingLug } from "../public/lifting-lug-engine.js";

const baseInputs = {
  totalLoad: 20,
  impactFactor: 1.15,
  activeLugs: 2,
  slingAngleDeg: 60,
  useHelperDemand: true,
  manualDemand: 12,
  designMethod: "ASD",
  considerDeformation: true,
  shearLagFactor: 1,
  blockShearFactor: 1,
  fy: 50,
  fu: 65,
  thickness: 1,
  width: 6,
  holeDiameter: 2,
  pinDiameter: 1.75,
  edgeDistance: 3
};

test("rigging helper computes per-lug demand from load, factor, and sling angle", () => {
  const result = calculateLiftingLug(baseInputs);

  assert.equal(result.demand.helperDemand, 13.279);
  assert.equal(result.demand.selectedDemand, 13.279);
});

test("lug-only calculator returns four implemented checks", () => {
  const result = calculateLiftingLug(baseInputs);

  assert.deepEqual(
    result.checks.map((check) => check.key),
    ["grossYielding", "netRupture", "blockShear", "bearing"]
  );
});

test("checks expose the ASD or LRFD factor used", () => {
  const asd = calculateLiftingLug(baseInputs);
  const asdBearing = asd.checks.find((check) => check.key === "bearing");
  const lrfd = calculateLiftingLug({ ...baseInputs, designMethod: "LRFD" });
  const lrfdBearing = lrfd.checks.find((check) => check.key === "bearing");

  assert.equal(asdBearing.factorLabel, "Omega");
  assert.equal(asdBearing.factorValue, 2);
  assert.equal(asdBearing.availableExpression, "Rn / Omega");
  assert.equal(lrfdBearing.factorLabel, "phi");
  assert.equal(lrfdBearing.factorValue, 0.75);
  assert.equal(lrfdBearing.availableExpression, "phi Rn");
});

test("weak end distance causes the bearing proxy to control and fail", () => {
  const result = calculateLiftingLug({
    ...baseInputs,
    totalLoad: 30,
    impactFactor: 1.25,
    activeLugs: 1,
    width: 4,
    thickness: 0.5,
    holeDiameter: 2.5,
    pinDiameter: 2.375,
    edgeDistance: 1.5
  });

  assert.equal(result.controllingCheck.key, "bearing");
  assert.equal(result.controllingCheck.status, "fail");
  assert.equal(result.controllingCheck.available, 4.875);
});

test("lrfd gross yielding uses phi times nominal strength", () => {
  const result = calculateLiftingLug({
    ...baseInputs,
    designMethod: "LRFD",
    useHelperDemand: false,
    manualDemand: 100
  });
  const grossYielding = result.checks.find((check) => check.key === "grossYielding");

  assert.equal(grossYielding.nominal, 300);
  assert.equal(grossYielding.available, 270);
  assert.equal(grossYielding.status, "pass");
});

test("invalid geometry produces direct warnings", () => {
  const result = calculateLiftingLug({
    ...baseInputs,
    width: 2,
    holeDiameter: 2,
    pinDiameter: 2.25,
    edgeDistance: 1
  });

  assert.ok(result.warnings.includes("Pin diameter exceeds hole diameter."));
  assert.ok(result.warnings.includes("Plate width at the hole must exceed the hole diameter."));
  assert.ok(result.warnings.includes("Edge distance must exceed one-half of the hole diameter."));
});
