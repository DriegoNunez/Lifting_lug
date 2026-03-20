export const DEFAULT_INPUTS = {
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

export const WORKBOOK_METADATA = {
  title: "LIFTING LUG DESIGN - STATIC DESIGN BASIS",
  subtitle: "Pursuant to ASME BTH-1-2023 | AISC 360-22",
  project: "GRB Convention Center",
  projectNumber: "125-165",
  company: "INNOVA Technologies",
  workbookDate: "March 17, 2026"
};

export const WORKBOOK_NOTES = [
  "Yellow highlighted cells are user inputs (shown in blue text). All other calculated values update automatically.",
  "Bearing capacity (FM 4) uses a 0.9 coefficient per Ricker (1991) for loose-fitting pins, not AISC J7-1 (1.8 coefficient for tight-fit pins).",
  "Tension rupture effective width b_e is limited per AISC Specification Section D5-1b: b_e <= min(b_e, 2*t + 0.63 in).",
  "Out-of-plane bending (FM 6) uses plastic section modulus Z = 1/4 * B_tot * t^2; eccentricity arm = h + D_h/2.",
  "Shear reduction Z' follows ASME B30 Eq. C-2; shear area A_sf follows AISC Eq. D5-2."
];

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 3) {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function minimumFinite(values) {
  return values.reduce((current, value) => {
    if (!Number.isFinite(value)) {
      return current;
    }

    return value < current ? value : current;
  }, Number.POSITIVE_INFINITY);
}

function isControlled(allowable, governingAllowable) {
  return Number.isFinite(allowable) && Number.isFinite(governingAllowable) && allowable === governingAllowable;
}

function createStatus(allowable, designLoad) {
  if (!Number.isFinite(allowable)) {
    return "not-checked";
  }

  return allowable > designLoad ? "ok" : "check";
}

function buildInputRow({ cell, label, symbol, name, unit, note }, inputs) {
  return {
    cell,
    label,
    symbol,
    inputName: name,
    inputValue: inputs[name],
    formula: "",
    result: inputs[name],
    unit,
    note,
    kind: "input"
  };
}

function buildDerivedRow({ cell, label, symbol, formula, result, unit, note }) {
  return {
    cell,
    label,
    symbol,
    formula,
    result,
    unit,
    note,
    kind: "derived"
  };
}

export function calculateLiftingLug(rawInputs = {}) {
  const inputs = {
    elasticModulus: toFiniteNumber(rawInputs.elasticModulus, DEFAULT_INPUTS.elasticModulus),
    baseFy: toFiniteNumber(rawInputs.baseFy, DEFAULT_INPUTS.baseFy),
    baseFu: toFiniteNumber(rawInputs.baseFu, DEFAULT_INPUTS.baseFu),
    lugFy: toFiniteNumber(rawInputs.lugFy, DEFAULT_INPUTS.lugFy),
    lugFu: toFiniteNumber(rawInputs.lugFu, DEFAULT_INPUTS.lugFu),
    materialAbovePin: toFiniteNumber(rawInputs.materialAbovePin, DEFAULT_INPUTS.materialAbovePin),
    holeDiameter: toFiniteNumber(rawInputs.holeDiameter, DEFAULT_INPUTS.holeDiameter),
    pinDiameter: toFiniteNumber(rawInputs.pinDiameter, DEFAULT_INPUTS.pinDiameter),
    materialBelowHole: toFiniteNumber(rawInputs.materialBelowHole, DEFAULT_INPUTS.materialBelowHole),
    lugThickness: toFiniteNumber(rawInputs.lugThickness, DEFAULT_INPUTS.lugThickness),
    designLoad: toFiniteNumber(rawInputs.designLoad, DEFAULT_INPUTS.designLoad),
    outOfPlaneAngleDeg: toFiniteNumber(rawInputs.outOfPlaneAngleDeg, DEFAULT_INPUTS.outOfPlaneAngleDeg),
    shearPlaneAngleDeg: toFiniteNumber(rawInputs.shearPlaneAngleDeg, DEFAULT_INPUTS.shearPlaneAngleDeg),
    nominalDesignFactor: toFiniteNumber(rawInputs.nominalDesignFactor, DEFAULT_INPUTS.nominalDesignFactor),
    tensionRuptureOmega: toFiniteNumber(rawInputs.tensionRuptureOmega, DEFAULT_INPUTS.tensionRuptureOmega)
  };

  const warnings = [];
  const assumptions = [];

  if (inputs.lugThickness <= 0 || inputs.holeDiameter <= 0 || inputs.pinDiameter <= 0) {
    warnings.push("Hole diameter, pin diameter, and lug thickness must all be greater than zero.");
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

  const shearPlaneRadians = (inputs.shearPlaneAngleDeg * Math.PI) / 180;
  const outOfPlaneRadians = (inputs.outOfPlaneAngleDeg * Math.PI) / 180;

  const radius = 0.5 * inputs.holeDiameter + inputs.materialAbovePin; // F27
  const sideMaterial = radius - 0.5 * inputs.holeDiameter; // F28
  const baseTotal = 2 * sideMaterial + inputs.holeDiameter; // F29
  const totalHeight = inputs.materialBelowHole + inputs.holeDiameter + inputs.materialAbovePin; // F31

  const shearReductionRadicand =
    radius ** 2 - ((inputs.pinDiameter / 2) * Math.sin(shearPlaneRadians)) ** 2;
  const shearPlaneReduction = shearReductionRadicand >= 0
    ? radius - Math.sqrt(shearReductionRadicand)
    : Number.NaN; // B39

  const grossTensionAllowableStress = inputs.lugFy / inputs.nominalDesignFactor; // C44
  const effectiveTensionAllowableStress = inputs.lugFu / (1.2 * inputs.nominalDesignFactor); // C45
  const bearingAllowableStress = 1.25 * inputs.lugFy / inputs.nominalDesignFactor; // C46
  const bendingAllowableStress = 1.25 * inputs.lugFy / inputs.nominalDesignFactor; // C47
  const slendernessLimit = inputs.lugFy > 0 ? 2.45 * Math.sqrt(inputs.elasticModulus / inputs.lugFy) : Number.NaN;
  const shearAllowableStress =
    inputs.materialAbovePin / inputs.lugThickness <= slendernessLimit
      ? inputs.lugFy / (inputs.nominalDesignFactor * Math.sqrt(3))
      : inputs.lugFy / inputs.nominalDesignFactor; // C48

  const grossTensionOmega = inputs.lugFy / grossTensionAllowableStress; // E44
  const bearingOmega = inputs.lugFy / bearingAllowableStress; // E46
  const bendingOmega = inputs.lugFy / bendingAllowableStress; // E47
  const shearOmega = inputs.lugFy / shearAllowableStress; // E48

  const effectiveWidth = Math.min(sideMaterial, 2 * inputs.lugThickness + 0.63); // B56
  const shearArea = 2 * (inputs.materialAbovePin - shearPlaneReduction + inputs.pinDiameter / 2) * inputs.lugThickness; // B59
  const plasticSectionModulus = 0.25 * baseTotal * inputs.lugThickness ** 2; // B66
  const outOfPlaneLeverArm = inputs.materialBelowHole + inputs.holeDiameter / 2;

  const fm1Allowable = inputs.lugThickness * baseTotal * inputs.lugFy / grossTensionOmega; // D53
  const fm2Allowable = inputs.lugFu * (2 * inputs.lugThickness * effectiveWidth) / inputs.tensionRuptureOmega; // D55
  const fm3Allowable = 0.6 * inputs.lugFu * shearArea / shearOmega; // D58
  const fm4Allowable = 0.9 * inputs.lugFy * inputs.lugThickness * inputs.pinDiameter / bearingOmega; // D61
  const fm5Allowable =
    1.67 * inputs.lugFy * inputs.lugThickness * inputs.materialAbovePin ** 2 / (bendingOmega * inputs.pinDiameter); // D63
  const fm6Allowable =
    inputs.outOfPlaneAngleDeg === 0
      ? null
      : inputs.lugFy * plasticSectionModulus ** 2 /
        (bendingOmega * Math.sin(outOfPlaneRadians) * (inputs.materialBelowHole + inputs.holeDiameter / 2)); // D65

  if (inputs.outOfPlaneAngleDeg === 0) {
    assumptions.push("FM 6 follows the workbook IFERROR behavior and is reported as 'Do not check this' when the out-of-plane angle is 0 degrees.");
  }

  const governingAllowable = minimumFinite([
    fm1Allowable,
    fm2Allowable,
    fm3Allowable,
    fm4Allowable,
    fm5Allowable,
    fm6Allowable
  ]);

  const failureModes = [
    {
      key: "grossYielding",
      cell: "D53",
      label: "FM 1 - Yielding of Gross Section",
      summaryLabel: "FM 1 - Yielding of Gross Section",
      reference: "AISC D2-1 / BTH Eq.3-1",
      equation: "C32 * F29 * B10 / E44",
      displayEquation: "P_allow = t_lug * B_tot * Fy_lug / Omega_gross",
      allowable: fm1Allowable,
      helperRows: [],
      figure: {
        main: "./workbook-media/image4.png",
        support: ["./workbook-media/image5.png"]
      }
    },
    {
      key: "tensionRupture",
      cell: "D55",
      label: "FM 2 - Tension Rupture on Effective Area",
      summaryLabel: "FM 2 - Tension Rupture on Effective Area",
      reference: "AISC D5-1b",
      equation: "B11 * (2 * C32 * B56) / E49",
      displayEquation: "P_allow = Fu_lug * (2 * t_lug * b_e) / Omega_tens_rupt",
      allowable: fm2Allowable,
      helperRows: [
        buildDerivedRow({
          cell: "B56",
          label: "b_e =",
          symbol: "b_e",
          formula: "MIN(F28, 2 * C32 + 0.63)",
          result: effectiveWidth,
          unit: "in",
          note: "Effective width limit per AISC D5-1b"
        })
      ],
      figure: {
        main: "./workbook-media/image6.png",
        support: ["./workbook-media/image7.png", "./workbook-media/image8.png"]
      }
    },
    {
      key: "shearRupture",
      cell: "D58",
      label: "FM 3 - Shear Rupture (Parallel Planes)",
      summaryLabel: "FM 3 - Shear Rupture (Parallel Planes)",
      reference: "AISC D5-2",
      equation: "0.6 * B11 * B59 / E48",
      displayEquation: "P_allow = 0.6 * Fu_lug * A_sf / Omega_shear",
      allowable: fm3Allowable,
      helperRows: [
        buildDerivedRow({
          cell: "B59",
          label: "A_sf =",
          symbol: "A_sf",
          formula: "2 * (C24 - B39 + C26/2) * C32",
          result: shearArea,
          unit: "in^2",
          note: "Parallel shear planes"
        })
      ],
      figure: {
        main: "./workbook-media/image9.png",
        support: ["./workbook-media/image10.png", "./workbook-media/image11.png"]
      }
    },
    {
      key: "bearingFailure",
      cell: "D61",
      label: "FM 4 - Bearing Failure at Pin",
      summaryLabel: "FM 4 - Bearing Failure at Pin",
      reference: "AISC J7-1 / Ricker 1991",
      equation: "0.9 * B10 * C32 * C26 / E46",
      displayEquation: "P_allow = 0.9 * Fy_lug * t_lug * D_pin / Omega_bearing",
      allowable: fm4Allowable,
      helperRows: [],
      figure: {
        main: "./workbook-media/image12.png",
        support: ["./workbook-media/image13.png", "./workbook-media/image14.png"]
      }
    },
    {
      key: "lineTearOut",
      cell: "D63",
      label: "FM 5 - Tearing Tension Along Line of Action",
      summaryLabel: "FM 5 - Tearing Tension Along Line",
      reference: "Ricker 1991 / ASME B30",
      equation: "1.67 * B10 * C32 * C24^2 / (E47 * C26)",
      displayEquation: "P_allow = 1.67 * Fy_lug * t_lug * a^2 / (Omega_bending * D_pin)",
      allowable: fm5Allowable,
      helperRows: [],
      figure: {
        main: "./workbook-media/image15.png",
        support: ["./workbook-media/image16.png"]
      }
    },
    {
      key: "outOfPlaneBending",
      cell: "D65",
      label: "FM 6 - Out-of-Plane Bending (Weak Axis)",
      summaryLabel: "FM 6 - Out-of-Plane Bending",
      reference: "BTH-1 Eq.3-25",
      equation: "IFERROR(B10 * B66^2 / (E47 * SIN(RADIANS(B37)) * (C30 + C25/2)), \"Do not check this\")",
      displayEquation: "P_allow = Fy_lug * Z_plastic^2 / (Omega_bending * sin(Delta_oop) * (h + D_h/2))",
      allowable: fm6Allowable,
      helperRows: [
        buildDerivedRow({
          cell: "B66",
          label: "Z_plastic =",
          symbol: "Z_plastic",
          formula: "0.25 * F29 * C32^2",
          result: plasticSectionModulus,
          unit: "in^3",
          note: "Plastic section modulus about the weak axis"
        })
      ],
      figure: {
        main: "./workbook-media/image17.png",
        support: ["./workbook-media/image18.png", "./workbook-media/image19.png"]
      }
    }
  ].map((mode) => ({
    ...mode,
    allowable: Number.isFinite(mode.allowable) ? round(mode.allowable) : null,
    controls: isControlled(round(mode.allowable), round(governingAllowable)),
    status: createStatus(mode.allowable, inputs.designLoad)
  }));

  const controllingMode = failureModes.find((mode) => mode.controls) || null;

  const cells = {
    B39: Number.isFinite(shearPlaneReduction) ? round(shearPlaneReduction) : null,
    B56: round(effectiveWidth),
    B59: round(shearArea),
    B66: round(plasticSectionModulus),
    C44: round(grossTensionAllowableStress),
    C45: round(effectiveTensionAllowableStress),
    C46: round(bearingAllowableStress),
    C47: round(bendingAllowableStress),
    C48: round(shearAllowableStress),
    D53: round(fm1Allowable),
    D55: round(fm2Allowable),
    D58: round(fm3Allowable),
    D61: round(fm4Allowable),
    D63: round(fm5Allowable),
    D65: Number.isFinite(fm6Allowable) ? round(fm6Allowable) : null,
    D77: Number.isFinite(governingAllowable) ? round(governingAllowable) : null,
    E44: round(grossTensionOmega, 3),
    E46: round(bearingOmega, 3),
    E47: round(bendingOmega, 3),
    E48: round(shearOmega, 3),
    F27: round(radius),
    F28: round(sideMaterial),
    F29: round(baseTotal),
    F31: round(totalHeight),
    F77: controllingMode ? controllingMode.summaryLabel : "No governing failure mode"
  };

  return {
    metadata: WORKBOOK_METADATA,
    notes: WORKBOOK_NOTES,
    inputs,
    assumptions,
    warnings,
    cells,
    sections: {
      material: [
        buildInputRow({ cell: "B9", label: "Elastic Modulus E", symbol: "E", name: "elasticModulus", unit: "ksi" }, inputs),
        buildInputRow({ cell: "B10", label: "Lug Yield Stress Fy_lug", symbol: "Fy_lug", name: "lugFy", unit: "ksi" }, inputs),
        buildInputRow({ cell: "B11", label: "Lug Ultimate Stress Fu_lug", symbol: "Fu_lug", name: "lugFu", unit: "ksi" }, inputs),
        buildInputRow({ cell: "E9", label: "Base Fy (Fy_base)", symbol: "Fy_base", name: "baseFy", unit: "ksi" }, inputs),
        buildInputRow({ cell: "E10", label: "Base Fu (Fu_base)", symbol: "Fu_base", name: "baseFu", unit: "ksi" }, inputs)
      ],
      geometry: [
        buildInputRow({ cell: "C24", label: "Material Above Pin", symbol: "a", name: "materialAbovePin", unit: "in" }, inputs),
        buildInputRow({ cell: "C25", label: "Hole Diameter", symbol: "D_h", name: "holeDiameter", unit: "in" }, inputs),
        buildInputRow({ cell: "C26", label: "Pin Diameter", symbol: "D_pin", name: "pinDiameter", unit: "in" }, inputs),
        buildDerivedRow({
          cell: "F27",
          label: "Radius",
          symbol: "r",
          formula: "0.5 * C25 + C24",
          result: radius,
          unit: "in",
          note: "(1/2) * D_h + a"
        }),
        buildDerivedRow({
          cell: "F28",
          label: "Side Material",
          symbol: "b_e",
          formula: "F27 - 0.5 * C25",
          result: sideMaterial,
          unit: "in",
          note: "r - (1/2) * D_h"
        }),
        buildDerivedRow({
          cell: "F29",
          label: "Base Total",
          symbol: "B_tot",
          formula: "2 * F28 + C25",
          result: baseTotal,
          unit: "in",
          note: "2 * b_e + D_h"
        }),
        buildInputRow({ cell: "C30", label: "Material Below Hole", symbol: "h", name: "materialBelowHole", unit: "in" }, inputs),
        buildDerivedRow({
          cell: "F31",
          label: "Total Height",
          symbol: "H",
          formula: "C30 + C25 + C24",
          result: totalHeight,
          unit: "in",
          note: "h + D_h + a"
        }),
        buildInputRow({ cell: "C32", label: "Lug Thickness", symbol: "t_lug", name: "lugThickness", unit: "in" }, inputs)
      ],
      loading: [
        buildInputRow({ cell: "B36", label: "Design Load", symbol: "P", name: "designLoad", unit: "kip" }, inputs),
        buildInputRow({ cell: "B37", label: "Out-of-Plane Angle", symbol: "Delta_oop", name: "outOfPlaneAngleDeg", unit: "deg", note: "Ref. ASME B30 Sec. 2-2" }, inputs),
        buildInputRow({ cell: "B38", label: "Shear Plane Loading Angle", symbol: "phi", name: "shearPlaneAngleDeg", unit: "deg", note: "Ref. ASME B30 Eq. C-2" }, inputs),
        buildDerivedRow({
          cell: "B39",
          label: "Shear Plane Reduction Z'",
          symbol: "Z'",
          formula: "F27 - SQRT(F27^2 - (C26/2 * SIN(RADIANS(B38)))^2)",
          result: shearPlaneReduction,
          unit: "in",
          note: "ASME B30 Eq. C-2"
        })
      ],
      allowables: [
        {
          cell: "C44",
          stressType: "Gross Tension Yield Ft_gross",
          reference: "BTH-1 Eq.3-1",
          allowableStress: grossTensionAllowableStress,
          unit: "ksi",
          safetyFactor: grossTensionOmega,
          note: "Omega = 2.0"
        },
        {
          cell: "C45",
          stressType: "Effective Tension Ft_effect",
          reference: "BTH-1 Eq.3-2",
          allowableStress: effectiveTensionAllowableStress,
          unit: "ksi",
          safetyFactor: null,
          note: "Omega = -"
        },
        {
          cell: "C46",
          stressType: "Bearing Stress Fp",
          reference: "BTH-1 Eq.3-53",
          allowableStress: bearingAllowableStress,
          unit: "ksi",
          safetyFactor: bearingOmega,
          note: "Omega = 1.6"
        },
        {
          cell: "C47",
          stressType: "Minor Axis Bending Fb",
          reference: "BTH-1 Eq.3-25",
          allowableStress: bendingAllowableStress,
          unit: "ksi",
          safetyFactor: bendingOmega,
          note: "Omega = 1.6"
        },
        {
          cell: "C48",
          stressType: "Shear Fv",
          reference: "BTH-1 / B30 3-2.3.6",
          allowableStress: shearAllowableStress,
          unit: "ksi",
          safetyFactor: shearOmega,
          note: "Omega = 3.5"
        }
      ].map((row) => ({
        ...row,
        allowableStress: round(row.allowableStress),
        safetyFactor: Number.isFinite(row.safetyFactor) ? round(row.safetyFactor, 3) : null
      })),
      failureModes,
      summary: failureModes.map((mode) => ({
        label: mode.summaryLabel,
        allowable: mode.allowable,
        status: mode.status
      }))
    },
    summary: {
      governingAllowable: Number.isFinite(governingAllowable) ? round(governingAllowable) : null,
      governingMode: controllingMode ? controllingMode.summaryLabel : "No governing failure mode",
      allPass: failureModes.every((mode) => mode.status !== "check")
    },
    mapping: [
      {
        workbookSection: "Material Properties (Rows 9-11)",
        htmlComponent: "Material properties table",
        codeArea: "public/lifting-lug-engine.js -> sections.material / public/app.js -> renderMaterialSection"
      },
      {
        workbookSection: "Lug Section Geometry (Rows 24-32)",
        htmlComponent: "Geometry workbook table + geometry figure strip",
        codeArea: "public/lifting-lug-engine.js -> sections.geometry / public/app.js -> renderGeometrySection"
      },
      {
        workbookSection: "Loading Information (Rows 36-39)",
        htmlComponent: "Loading table",
        codeArea: "public/lifting-lug-engine.js -> sections.loading / public/app.js -> renderLoadingSection"
      },
      {
        workbookSection: "Allowable Stresses & Safety Factors (Rows 42-49)",
        htmlComponent: "Allowables table",
        codeArea: "public/lifting-lug-engine.js -> sections.allowables / public/app.js -> renderAllowablesSection"
      },
      {
        workbookSection: "Failure Mode Capacities (Rows 53-66)",
        htmlComponent: "Failure mode blocks with helper rows and workbook images",
        codeArea: "public/lifting-lug-engine.js -> sections.failureModes / public/app.js -> renderFailureModes"
      },
      {
        workbookSection: "Design Summary (Rows 70-77)",
        htmlComponent: "Summary table + governing result banner",
        codeArea: "public/lifting-lug-engine.js -> sections.summary / public/app.js -> renderSummarySection"
      }
    ]
  };
}
