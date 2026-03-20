import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_INPUTS, calculateLiftingLug } from "../public/lifting-lug-engine.js";

test("geometry helper cells reproduce the workbook sequence", () => {
  const result = calculateLiftingLug(DEFAULT_INPUTS);

  assert.equal(result.cells.F27, 10);
  assert.equal(result.cells.F28, 6);
  assert.equal(result.cells.F29, 20);
  assert.equal(result.cells.F31, 36);
});

test("allowable stresses and safety factors match workbook values", () => {
  const result = calculateLiftingLug(DEFAULT_INPUTS);

  assert.equal(result.cells.C44, 12.5);
  assert.equal(result.cells.C45, 13.542);
  assert.equal(result.cells.C46, 15.625);
  assert.equal(result.cells.C48, 7.217);
  assert.equal(result.cells.E48, 6.928);
});

test("failure mode capacities match workbook results", () => {
  const result = calculateLiftingLug(DEFAULT_INPUTS);
  const capacities = Object.fromEntries(
    result.sections.failureModes.map((mode) => [mode.key, mode.allowable])
  );

  assert.deepEqual(capacities, {
    grossYielding: 250,
    tensionRupture: 113.967,
    shearRupture: 112.583,
    bearingFailure: 112.5,
    lineTearOut: 117.422,
    outOfPlaneBending: null
  });
});

test("design summary identifies the governing mode from numeric capacities", () => {
  const result = calculateLiftingLug(DEFAULT_INPUTS);

  assert.equal(result.summary.governingAllowable, 112.5);
  assert.equal(result.summary.governingMode, "FM 4 - Bearing Failure at Pin");
  assert.equal(result.cells.F77, "FM 4 - Bearing Failure at Pin");
});

test("out-of-plane bending becomes numeric when the workbook angle is nonzero", () => {
  const result = calculateLiftingLug({
    ...DEFAULT_INPUTS,
    outOfPlaneAngleDeg: 10
  });

  const fm6 = result.sections.failureModes.find((mode) => mode.key === "outOfPlaneBending");

  assert.ok(fm6.allowable !== null);
  assert.equal(fm6.status, "check");
});

test("invalid geometry still raises workbook guardrail warnings", () => {
  const result = calculateLiftingLug({
    ...DEFAULT_INPUTS,
    lugThickness: 0,
    pinDiameter: 9
  });

  assert.ok(result.warnings.includes("Hole diameter, pin diameter, and lug thickness must all be greater than zero."));
  assert.ok(result.warnings.includes("Pin diameter exceeds hole diameter."));
});
