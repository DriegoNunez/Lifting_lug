const DESIGN_FACTORS = {
  LRFD: {
    label: "LRFD",
    grossYielding: { phi: 0.9, omega: 1.67 },
    netRupture: { phi: 0.75, omega: 2.0 },
    blockShear: { phi: 0.75, omega: 2.0 },
    bearing: { phi: 0.75, omega: 2.0 }
  },
  ASD: {
    label: "ASD",
    grossYielding: { phi: 0.9, omega: 1.67 },
    netRupture: { phi: 0.75, omega: 2.0 },
    blockShear: { phi: 0.75, omega: 2.0 },
    bearing: { phi: 0.75, omega: 2.0 }
  }
};

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, decimals = 3) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function createCheck({
  key,
  label,
  spec,
  nominal,
  method,
  demand,
  details,
  phi,
  omega,
  isApproximate = false
}) {
  const available = method === "LRFD" ? phi * nominal : nominal / omega;
  const rawRatio = available > 0 ? demand / available : Number.POSITIVE_INFINITY;

  return {
    key,
    label,
    spec,
    nominal: round(nominal),
    available: round(available),
    ratio: Number.isFinite(rawRatio) ? round(rawRatio) : null,
    sortRatio: rawRatio,
    status: available > 0 && demand <= available ? "pass" : "fail",
    factorLabel: method === "LRFD" ? "phi" : "Omega",
    factorValue: round(method === "LRFD" ? phi : omega, 2),
    availableExpression: method === "LRFD" ? "phi Rn" : "Rn / Omega",
    isApproximate,
    details
  };
}

function buildDemand(inputs) {
  const totalLoad = toFiniteNumber(inputs.totalLoad);
  const impactFactor = toFiniteNumber(inputs.impactFactor, 1);
  const activeLugs = Math.max(1, toFiniteNumber(inputs.activeLugs, 1));
  const slingAngleDeg = toFiniteNumber(inputs.slingAngleDeg, 60);
  const manualDemand = toFiniteNumber(inputs.manualDemand);
  const useHelperDemand = Boolean(inputs.useHelperDemand);

  const angleRadians = (slingAngleDeg * Math.PI) / 180;
  const sine = Math.sin(angleRadians);
  const helperDemand = sine > 0 ? (totalLoad * impactFactor) / (activeLugs * sine) : 0;

  return {
    totalLoad,
    impactFactor,
    activeLugs,
    slingAngleDeg,
    helperDemand: round(helperDemand),
    selectedDemand: round(useHelperDemand ? helperDemand : manualDemand),
    useHelperDemand
  };
}

export function calculateLiftingLug(rawInputs) {
  const inputs = {
    designMethod: rawInputs.designMethod === "LRFD" ? "LRFD" : "ASD",
    totalLoad: toFiniteNumber(rawInputs.totalLoad),
    impactFactor: toFiniteNumber(rawInputs.impactFactor, 1),
    activeLugs: toFiniteNumber(rawInputs.activeLugs, 1),
    slingAngleDeg: toFiniteNumber(rawInputs.slingAngleDeg, 60),
    useHelperDemand: rawInputs.useHelperDemand !== false,
    manualDemand: toFiniteNumber(rawInputs.manualDemand),
    fy: toFiniteNumber(rawInputs.fy, 50),
    fu: toFiniteNumber(rawInputs.fu, 65),
    thickness: toFiniteNumber(rawInputs.thickness, 1),
    width: toFiniteNumber(rawInputs.width, 6),
    holeDiameter: toFiniteNumber(rawInputs.holeDiameter, 2),
    pinDiameter: toFiniteNumber(rawInputs.pinDiameter, 1.75),
    edgeDistance: toFiniteNumber(rawInputs.edgeDistance, 3),
    shearLagFactor: toFiniteNumber(rawInputs.shearLagFactor, 1),
    blockShearFactor: toFiniteNumber(rawInputs.blockShearFactor, 1),
    considerDeformation: rawInputs.considerDeformation !== false
  };

  const factors = DESIGN_FACTORS[inputs.designMethod];
  const demand = buildDemand(inputs);
  const warnings = [];

  if (inputs.slingAngleDeg <= 0 || inputs.slingAngleDeg >= 90) {
    warnings.push("Sling angle must stay between 0 and 90 degrees from horizontal.");
  }

  if (inputs.pinDiameter > inputs.holeDiameter) {
    warnings.push("Pin diameter exceeds hole diameter.");
  }

  if (inputs.width <= inputs.holeDiameter) {
    warnings.push("Plate width at the hole must exceed the hole diameter.");
  }

  if (inputs.edgeDistance <= inputs.holeDiameter / 2) {
    warnings.push("Edge distance must exceed one-half of the hole diameter.");
  }

  if (inputs.thickness <= 0 || inputs.width <= 0 || inputs.edgeDistance <= 0) {
    warnings.push("Plate dimensions must all be greater than zero.");
  }

  if (!demand.useHelperDemand && demand.selectedDemand <= 0) {
    warnings.push("Manual per-lug demand should be greater than zero.");
  }

  if (demand.useHelperDemand && demand.selectedDemand <= 0) {
    warnings.push("Rigging helper demand is zero or invalid. Check load, angle, and lug count.");
  }

  const netWidth = Math.max(inputs.width - inputs.holeDiameter, 0);
  const clearEdgeDistance = Math.max(inputs.edgeDistance - inputs.holeDiameter / 2, 0);
  const holeClearance = round(inputs.holeDiameter - inputs.pinDiameter, 4);
  const grossArea = inputs.width * inputs.thickness;
  const netArea = netWidth * inputs.thickness;
  const effectiveNetArea = inputs.shearLagFactor * netArea;
  const grossShearArea = 2 * inputs.edgeDistance * inputs.thickness;
  const netShearArea = 2 * clearEdgeDistance * inputs.thickness;
  const blockTensionArea = netArea;

  const checks = [];

  checks.push(
    createCheck({
      key: "grossYielding",
      label: "Gross section yielding",
      spec: "AISC 360-22 Chapter D",
      nominal: inputs.fy * grossArea,
      method: inputs.designMethod,
      demand: demand.selectedDemand,
      details: {
        equation: "Rn = Fy Ag",
        grossArea: round(grossArea),
        fy: inputs.fy
      },
      phi: factors.grossYielding.phi,
      omega: factors.grossYielding.omega
    })
  );

  checks.push(
    createCheck({
      key: "netRupture",
      label: "Net section rupture",
      spec: "AISC 360-22 Chapter D",
      nominal: inputs.fu * effectiveNetArea,
      method: inputs.designMethod,
      demand: demand.selectedDemand,
      details: {
        equation: "Rn = Fu Ae",
        netArea: round(netArea),
        effectiveNetArea: round(effectiveNetArea),
        shearLagFactor: inputs.shearLagFactor,
        fu: inputs.fu
      },
      phi: factors.netRupture.phi,
      omega: factors.netRupture.omega
    })
  );

  const blockShearRupture = 0.6 * inputs.fu * netShearArea + inputs.blockShearFactor * inputs.fu * blockTensionArea;
  const blockShearYieldCap = 0.6 * inputs.fy * grossShearArea + inputs.blockShearFactor * inputs.fu * blockTensionArea;
  const blockShearNominal = Math.min(blockShearRupture, blockShearYieldCap);

  checks.push(
    createCheck({
      key: "blockShear",
      label: "Block shear",
      spec: "AISC 360-22 J4.3",
      nominal: blockShearNominal,
      method: inputs.designMethod,
      demand: demand.selectedDemand,
      details: {
        equation: "Rn = min(0.6FuAnv + UbsFuAnt, 0.6FyAgv + UbsFuAnt)",
        grossShearArea: round(grossShearArea),
        netShearArea: round(netShearArea),
        tensionArea: round(blockTensionArea),
        blockShearFactor: inputs.blockShearFactor
      },
      phi: factors.blockShear.phi,
      omega: factors.blockShear.omega
    })
  );

  const bearingLc = clearEdgeDistance;
  const bearingNominal = inputs.considerDeformation
    ? Math.min(1.2 * bearingLc * inputs.thickness * inputs.fu, 2.4 * inputs.pinDiameter * inputs.thickness * inputs.fu)
    : Math.min(1.5 * bearingLc * inputs.thickness * inputs.fu, 3.0 * inputs.pinDiameter * inputs.thickness * inputs.fu);

  checks.push(
    createCheck({
      key: "bearing",
      label: "Pin bearing / tear-out proxy",
      spec: "AISC 360-22 J3.10 style proxy",
      nominal: bearingNominal,
      method: inputs.designMethod,
      demand: demand.selectedDemand,
      details: {
        equation: inputs.considerDeformation
          ? "Rn = min(1.2Lc t Fu, 2.4dp t Fu)"
          : "Rn = min(1.5Lc t Fu, 3.0dp t Fu)",
        clearEdgeDistance: round(bearingLc),
        pinDiameter: inputs.pinDiameter,
        fu: inputs.fu
      },
      phi: factors.bearing.phi,
      omega: factors.bearing.omega,
      isApproximate: true
    })
  );

  const controllingCheck = [...checks].sort((left, right) => right.sortRatio - left.sortRatio)[0] || null;
  const advisories = [];

  if (inputs.designMethod === "LRFD" && demand.useHelperDemand) {
    advisories.push(
      "The rigging helper is service-level statics only. Confirm the selected LRFD demand already reflects the required project load factors."
    );
  }

  advisories.push(
    "ASME BTH-1 classification, fatigue life, pin behavior, and supporting-member checks are not fully automated here and still need engineering review."
  );

  return {
    inputs,
    demand,
    geometry: {
      grossArea: round(grossArea),
      netArea: round(netArea),
      effectiveNetArea: round(effectiveNetArea),
      grossShearArea: round(grossShearArea),
      netShearArea: round(netShearArea),
      blockTensionArea: round(blockTensionArea),
      clearEdgeDistance: round(clearEdgeDistance),
      holeClearance
    },
    checks,
    controllingCheck,
    warnings,
    advisories
  };
}

export { DESIGN_FACTORS };
