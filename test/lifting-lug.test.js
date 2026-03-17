import test from "node:test";
import assert from "node:assert/strict";

import { calculateLiftingLug } from "../public/lifting-lug-engine.js";

const workbookInputs = {
  elasticModulus: 29000,
  baseFy: 50,
  baseFu: 65,
  lugFy: 50,
  lugFu: 65,
  materialAbovePin: 6,
  holeDiameter: 8,
  pinDiameter: 8,
  materialBelowHole: 22,
  lugThickness: 1,
  designLoad: 95,
  outOfPlaneAngleDeg: 0,
  shearPlaneAngleDeg: 0,
  nominalDesignFactor: 4,
  tensionRuptureOmega: 3
};

test("workbook example reproduces the key geometry values", () => {
  const result = calculateLiftingLug(workbookInputs);

  assert.equal(result.geometry.radius, 10);
  assert.equal(result.geometry.sideMaterial, 6);
  assert.equal(result.geometry.baseTotal, 20);
  assert.equal(result.geometry.totalHeight, 36);
});

test("workbook example reproduces the BTH allowable stresses", () => {
  const result = calculateLiftingLug(workbookInputs);
  const shear = result.allowables.find((item) => item.key === "shear");

  assert.equal(result.allowables.find((item) => item.key === "grossTension").allowableStress, 12.5);
  assert.equal(result.allowables.find((item) => item.key === "effectiveTension").allowableStress, 13.542);
  assert.equal(result.allowables.find((item) => item.key === "bearing").allowableStress, 15.625);
  assert.equal(shear.allowableStress, 7.217);
  assert.equal(shear.safetyFactor, 6.928);
});

test("workbook example reproduces the six failure mode outputs", () => {
  const result = calculateLiftingLug(workbookInputs);

  assert.deepEqual(
    result.checks.map((check) => [check.key, check.allowable]),
    [
      ["grossYielding", 250],
      ["tensionRupture", 113.967],
      ["shearRupture", 112.583],
      ["bearingFailure", 112.5],
      ["lineTearOut", 117.422],
      ["outOfPlaneBending", null]
    ]
  );
});

test("bearing failure governs the workbook example", () => {
  const result = calculateLiftingLug(workbookInputs);

  assert.equal(result.controllingCheck.key, "bearingFailure");
  assert.equal(result.controllingCheck.allowable, 112.5);
  assert.equal(result.summary.governingAllowableLoad, 112.5);
});

test("out-of-plane bending becomes numeric when the angle is nonzero", () => {
  const result = calculateLiftingLug({
    ...workbookInputs,
    outOfPlaneAngleDeg: 10
  });

  const weakAxis = result.checks.find((check) => check.key === "outOfPlaneBending");

  assert.equal(weakAxis.status, "fail");
  assert.ok(weakAxis.allowable < workbookInputs.designLoad);
});

test("invalid geometry still produces direct warnings", () => {
  const result = calculateLiftingLug({
    ...workbookInputs,
    lugThickness: 0,
    pinDiameter: 9
  });

  assert.ok(result.warnings.includes("Hole diameter, pin diameter, and lug thickness must all be greater than zero."));
  assert.ok(result.warnings.includes("Pin diameter exceeds hole diameter."));
});
