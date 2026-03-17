const DEFAULT_ALLOWABLES = {
  nominalDesignFactor: 4,
  tensionRuptureOmega: 3
};

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 3) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function createFailureMode({
  key,
  label,
  reference,
  equation,
  allowable,
  load,
  details
}) {
  const ratio = Number.isFinite(allowable) && load > 0 ? allowable / load : null;
  const margin = Number.isFinite(allowable) ? allowable - load : null;
  const status = Number.isFinite(allowable) ? (allowable > load ? "pass" : "fail") : "note";

  return {
    key,
    label,
    reference,
    equation,
    allowable: Number.isFinite(allowable) ? round(allowable) : null,
    ratio: Number.isFinite(ratio) ? round(ratio) : null,
    margin: Number.isFinite(margin) ? round(margin) : null,
    status,
    details
  };
}

export function calculateLiftingLug(rawInputs) {
  const inputs = {
    elasticModulus: toFiniteNumber(rawInputs.elasticModulus, 29000),
    baseFy: toFiniteNumber(rawInputs.baseFy, 50),
    baseFu: toFiniteNumber(rawInputs.baseFu, 65),
    lugFy: toFiniteNumber(rawInputs.lugFy, 50),
    lugFu: toFiniteNumber(rawInputs.lugFu, 65),
    materialAbovePin: toFiniteNumber(rawInputs.materialAbovePin, 6),
    holeDiameter: toFiniteNumber(rawInputs.holeDiameter, 8),
    pinDiameter: toFiniteNumber(rawInputs.pinDiameter, 8),
    materialBelowHole: toFiniteNumber(rawInputs.materialBelowHole, 22),
    lugThickness: toFiniteNumber(rawInputs.lugThickness, 1),
    designLoad: toFiniteNumber(rawInputs.designLoad, 95),
    outOfPlaneAngleDeg: toFiniteNumber(rawInputs.outOfPlaneAngleDeg, 0),
    shearPlaneAngleDeg: toFiniteNumber(rawInputs.shearPlaneAngleDeg, 0),
    nominalDesignFactor: toFiniteNumber(rawInputs.nominalDesignFactor, DEFAULT_ALLOWABLES.nominalDesignFactor),
    tensionRuptureOmega: toFiniteNumber(rawInputs.tensionRuptureOmega, DEFAULT_ALLOWABLES.tensionRuptureOmega)
  };

  const warnings = [];
  const advisories = [
    "Workbook formulas were ported directly from the Excel calculator, including the FM4 loose-pin bearing coefficient and the FM6 IFERROR behavior."
  ];

  if (inputs.lugThickness <= 0 || inputs.holeDiameter <= 0 || inputs.pinDiameter <= 0) {
    warnings.push("Hole diameter, pin diameter, and lug thickness must all be greater than zero.");
  }

  if (inputs.materialAbovePin < 0 || inputs.materialBelowHole < 0) {
    warnings.push("Material above and below the pin cannot be negative.");
  }

  if (inputs.pinDiameter > inputs.holeDiameter) {
    warnings.push("Pin diameter exceeds hole diameter.");
  }

  if (inputs.designLoad <= 0) {
    warnings.push("Design load should be greater than zero.");
  }

  if (inputs.nominalDesignFactor <= 0 || inputs.tensionRuptureOmega <= 0) {
    warnings.push("Nominal design factor and tension rupture omega must be greater than zero.");
  }

  const radius = 0.5 * inputs.holeDiameter + inputs.materialAbovePin;
  const sideMaterial = radius - 0.5 * inputs.holeDiameter;
  const baseTotal = 2 * sideMaterial + inputs.holeDiameter;
  const totalHeight = inputs.materialBelowHole + inputs.holeDiameter + inputs.materialAbovePin;

  const shearPlaneRadians = (inputs.shearPlaneAngleDeg * Math.PI) / 180;
  const outOfPlaneRadians = (inputs.outOfPlaneAngleDeg * Math.PI) / 180;
  const shearReductionRadicand =
    radius ** 2 - ((inputs.pinDiameter / 2) * Math.sin(shearPlaneRadians)) ** 2;
  const shearPlaneReduction = shearReductionRadicand >= 0
    ? radius - Math.sqrt(shearReductionRadicand)
    : Number.NaN;

  if (!Number.isFinite(shearPlaneReduction)) {
    warnings.push("The shear-plane reduction term became invalid. Check the shear-plane angle and geometry.");
  }

  const grossTensionAllowableStress = inputs.nominalDesignFactor > 0
    ? inputs.lugFy / inputs.nominalDesignFactor
    : Number.NaN;
  const grossTensionOmega = grossTensionAllowableStress > 0
    ? inputs.lugFy / grossTensionAllowableStress
    : Number.NaN;
  const effectiveTensionAllowableStress = inputs.nominalDesignFactor > 0
    ? inputs.lugFu / (1.2 * inputs.nominalDesignFactor)
    : Number.NaN;
  const bearingAllowableStress = inputs.nominalDesignFactor > 0
    ? 1.25 * inputs.lugFy / inputs.nominalDesignFactor
    : Number.NaN;
  const bendingAllowableStress = inputs.nominalDesignFactor > 0
    ? 1.25 * inputs.lugFy / inputs.nominalDesignFactor
    : Number.NaN;
  const bearingOmega = bearingAllowableStress > 0 ? inputs.lugFy / bearingAllowableStress : Number.NaN;
  const bendingOmega = bendingAllowableStress > 0 ? inputs.lugFy / bendingAllowableStress : Number.NaN;
  const slendernessLimit = inputs.lugFy > 0 ? 2.45 * Math.sqrt(inputs.elasticModulus / inputs.lugFy) : Number.NaN;
  const shearAllowableStress = inputs.nominalDesignFactor > 0
    ? (
        inputs.materialAbovePin / inputs.lugThickness <= slendernessLimit
          ? inputs.lugFy / (inputs.nominalDesignFactor * Math.sqrt(3))
          : inputs.lugFy / inputs.nominalDesignFactor
      )
    : Number.NaN;
  const shearOmega = shearAllowableStress > 0 ? inputs.lugFy / shearAllowableStress : Number.NaN;

  const effectiveTensionWidth = Math.min(sideMaterial, 2 * inputs.lugThickness + 0.63);
  const shearArea = Number.isFinite(shearPlaneReduction)
    ? 2 * (inputs.materialAbovePin - shearPlaneReduction + inputs.pinDiameter / 2) * inputs.lugThickness
    : Number.NaN;
  const plasticSectionModulus = 0.25 * baseTotal * inputs.lugThickness ** 2;
  const outOfPlaneLeverArm = inputs.materialBelowHole + inputs.holeDiameter / 2;
  const outOfPlaneSine = Math.sin(outOfPlaneRadians);

  const capacities = [
    createFailureMode({
      key: "grossYielding",
      label: "FM 1 - Yielding of Gross Section",
      reference: "AISC D2-1 / BTH Eq.3-1",
      equation: "P_allow = t_lug * B_tot * Fy_lug / Omega_gross",
      allowable: inputs.lugThickness * baseTotal * inputs.lugFy / grossTensionOmega,
      load: inputs.designLoad,
      details: {
        grossTensionOmega: round(grossTensionOmega, 3),
        baseTotal: round(baseTotal),
        lugThickness: round(inputs.lugThickness),
        lugFy: round(inputs.lugFy)
      }
    }),
    createFailureMode({
      key: "tensionRupture",
      label: "FM 2 - Tension Rupture on Effective Area",
      reference: "AISC D5-1b",
      equation: "P_allow = Fu_lug * (2 * t_lug * b_e,eff) / Omega_tension",
      allowable: inputs.lugFu * (2 * inputs.lugThickness * effectiveTensionWidth) / inputs.tensionRuptureOmega,
      load: inputs.designLoad,
      details: {
        effectiveTensionWidth: round(effectiveTensionWidth),
        tensionRuptureOmega: round(inputs.tensionRuptureOmega, 3),
        lugThickness: round(inputs.lugThickness),
        lugFu: round(inputs.lugFu)
      }
    }),
    createFailureMode({
      key: "shearRupture",
      label: "FM 3 - Shear Rupture (Parallel Planes)",
      reference: "AISC D5-2",
      equation: "P_allow = 0.6 * Fu_lug * A_sf / Omega_shear",
      allowable: 0.6 * inputs.lugFu * shearArea / shearOmega,
      load: inputs.designLoad,
      details: {
        shearArea: round(shearArea),
        shearPlaneReduction: round(shearPlaneReduction),
        shearOmega: round(shearOmega, 3),
        lugFu: round(inputs.lugFu)
      }
    }),
    createFailureMode({
      key: "bearingFailure",
      label: "FM 4 - Bearing Failure at Pin",
      reference: "AISC J7-1 / Ricker 1991",
      equation: "P_allow = 0.9 * Fy_lug * t_lug * D_pin / Omega_bearing",
      allowable: 0.9 * inputs.lugFy * inputs.lugThickness * inputs.pinDiameter / bearingOmega,
      load: inputs.designLoad,
      details: {
        loosePinCoefficient: 0.9,
        bearingOmega: round(bearingOmega, 3),
        lugThickness: round(inputs.lugThickness),
        pinDiameter: round(inputs.pinDiameter)
      }
    }),
    createFailureMode({
      key: "lineTearOut",
      label: "FM 5 - Tearing Tension Along Line of Action",
      reference: "Ricker 1991 / ASME B30",
      equation: "P_allow = 1.67 * Fy_lug * t_lug * a^2 / (Omega_bending * D_pin)",
      allowable:
        1.67 * inputs.lugFy * inputs.lugThickness * inputs.materialAbovePin ** 2 /
        (bendingOmega * inputs.pinDiameter),
      load: inputs.designLoad,
      details: {
        coefficient: 1.67,
        bendingOmega: round(bendingOmega, 3),
        materialAbovePin: round(inputs.materialAbovePin),
        pinDiameter: round(inputs.pinDiameter)
      }
    }),
    createFailureMode({
      key: "outOfPlaneBending",
      label: "FM 6 - Out-of-Plane Bending (Weak Axis)",
      reference: "BTH-1 Eq.3-25",
      equation: "P_allow = Fy_lug * Z_plastic^2 / (Omega_bending * sin(delta_oop) * (h + D_h/2))",
      allowable:
        outOfPlaneSine === 0
          ? null
          : inputs.lugFy * plasticSectionModulus ** 2 /
            (bendingOmega * outOfPlaneSine * outOfPlaneLeverArm),
      load: inputs.designLoad,
      details: {
        plasticSectionModulus: round(plasticSectionModulus),
        bendingOmega: round(bendingOmega, 3),
        outOfPlaneAngleDeg: round(inputs.outOfPlaneAngleDeg),
        outOfPlaneLeverArm: round(outOfPlaneLeverArm)
      }
    })
  ];

  const numericCapacities = capacities.filter((capacity) => Number.isFinite(capacity.allowable));
  const controllingCheck = numericCapacities.sort((left, right) => left.allowable - right.allowable)[0] || null;
  const allPass = capacities.every((capacity) => capacity.status !== "fail");

  if (inputs.outOfPlaneAngleDeg === 0) {
    advisories.push("FM 6 follows the workbook's IFERROR logic: a 0 degree out-of-plane angle is reported as not checked.");
  }

  return {
    inputs,
    demand: {
      selectedDemand: round(inputs.designLoad)
    },
    geometry: {
      radius: round(radius),
      sideMaterial: round(sideMaterial),
      baseTotal: round(baseTotal),
      totalHeight: round(totalHeight),
      effectiveTensionWidth: round(effectiveTensionWidth),
      shearArea: round(shearArea),
      plasticSectionModulus: round(plasticSectionModulus),
      outOfPlaneLeverArm: round(outOfPlaneLeverArm)
    },
    loading: {
      designLoad: round(inputs.designLoad),
      outOfPlaneAngleDeg: round(inputs.outOfPlaneAngleDeg),
      shearPlaneAngleDeg: round(inputs.shearPlaneAngleDeg),
      shearPlaneReduction: Number.isFinite(shearPlaneReduction) ? round(shearPlaneReduction) : null
    },
    allowables: [
      {
        key: "grossTension",
        label: "Gross tension yield, Ft_gross",
        reference: "BTH-1 Eq.3-1",
        allowableStress: round(grossTensionAllowableStress),
        safetyFactor: round(grossTensionOmega, 3)
      },
      {
        key: "effectiveTension",
        label: "Effective tension, Ft_effect",
        reference: "BTH-1 Eq.3-2",
        allowableStress: round(effectiveTensionAllowableStress),
        safetyFactor: null
      },
      {
        key: "bearing",
        label: "Bearing stress, Fp",
        reference: "BTH-1 Eq.3-53",
        allowableStress: round(bearingAllowableStress),
        safetyFactor: round(bearingOmega, 3)
      },
      {
        key: "bending",
        label: "Minor axis bending, Fb",
        reference: "BTH-1 Eq.3-25",
        allowableStress: round(bendingAllowableStress),
        safetyFactor: round(bendingOmega, 3)
      },
      {
        key: "shear",
        label: "Shear, Fv",
        reference: "BTH-1 / B30 3-2.3.6",
        allowableStress: round(shearAllowableStress),
        safetyFactor: round(shearOmega, 3)
      }
    ],
    checks: capacities,
    controllingCheck,
    summary: {
      governingAllowableLoad: controllingCheck ? controllingCheck.allowable : null,
      governingMode: controllingCheck ? controllingCheck.label : "No governing mode available",
      allPass
    },
    warnings,
    advisories
  };
}
