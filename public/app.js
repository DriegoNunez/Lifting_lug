import { calculateLiftingLug } from "./lifting-lug-engine.js";

const DEFAULT_INPUTS = {
  totalLoad: 20,
  impactFactor: 1.15,
  activeLugs: 2,
  slingAngleDeg: 60,
  useHelperDemand: true,
  manualDemand: 13.3,
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

const DETAIL_LABELS = {
  grossArea: "Ag",
  netArea: "An",
  effectiveNetArea: "Ae",
  shearLagFactor: "U",
  grossShearArea: "Agv",
  netShearArea: "Anv",
  tensionArea: "Ant",
  blockShearFactor: "Ubs",
  clearEdgeDistance: "Lc",
  pinDiameter: "dp",
  fy: "Fy",
  fu: "Fu"
};

const form = document.querySelector("[data-form]");
const helperDemandValue = document.querySelector("[data-helper-demand]");
const selectedDemandValue = document.querySelector("[data-selected-demand]");
const safetyFactorValue = document.querySelector("[data-safety-factor]");
const safetyFactorCopy = document.querySelector("[data-safety-factor-copy]");
const methodValue = document.querySelector("[data-method]");
const controllingValue = document.querySelector("[data-controlling]");
const controllingCopy = document.querySelector("[data-controlling-copy]");
const availableLabel = document.querySelector("[data-available-label]");
const verdict = document.querySelector("[data-verdict]");
const geometry = document.querySelector("[data-geometry]");
const checks = document.querySelector("[data-checks]");
const messages = document.querySelector("[data-messages]");
const diagram = document.querySelector("[data-diagram]");
const useHelperDemand = form.elements.namedItem("useHelperDemand");
const manualDemand = form.elements.namedItem("manualDemand");

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function formatKips(value) {
  return `${formatNumber(value, 2)} kip`;
}

function formatArea(value) {
  return `${formatNumber(value, 3)} in2`;
}

function formatRatio(value) {
  if (value === null) {
    return "Geometry invalid";
  }

  return `${formatNumber(value * 100, 0)}% utilization`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyDefaults() {
  Object.entries(DEFAULT_INPUTS).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);

    if (!field) {
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }

    field.value = String(value);
  });
}

function readInputs() {
  return {
    totalLoad: form.elements.namedItem("totalLoad").value,
    impactFactor: form.elements.namedItem("impactFactor").value,
    activeLugs: form.elements.namedItem("activeLugs").value,
    slingAngleDeg: form.elements.namedItem("slingAngleDeg").value,
    useHelperDemand: useHelperDemand.checked,
    manualDemand: manualDemand.value,
    designMethod: form.elements.namedItem("designMethod").value,
    considerDeformation: form.elements.namedItem("considerDeformation").checked,
    shearLagFactor: form.elements.namedItem("shearLagFactor").value,
    blockShearFactor: form.elements.namedItem("blockShearFactor").value,
    fy: form.elements.namedItem("fy").value,
    fu: form.elements.namedItem("fu").value,
    thickness: form.elements.namedItem("thickness").value,
    width: form.elements.namedItem("width").value,
    holeDiameter: form.elements.namedItem("holeDiameter").value,
    pinDiameter: form.elements.namedItem("pinDiameter").value,
    edgeDistance: form.elements.namedItem("edgeDistance").value
  };
}

function updateDemandMode() {
  manualDemand.disabled = useHelperDemand.checked;
}

function renderVerdict(result) {
  const allPass = result.checks.every((check) => check.status === "pass");
  const controlling = result.controllingCheck;
  const verdictClass = allPass ? "pass" : "fail";
  const verdictTitle = allPass ? "Current inputs pass every implemented lug check" : "Current inputs do not satisfy every implemented lug check";
  const methodLabel = result.inputs.designMethod === "LRFD" ? "phi Rn" : "Rn / Omega";
  const controllingLabel = controlling ? controlling.label : "No controlling check";
  const controllingStrength = controlling ? formatKips(controlling.available) : "--";

  verdict.className = `verdict-card ${verdictClass}`;
  verdict.innerHTML = `
    <h3 class="verdict-title">${escapeHtml(verdictTitle)}</h3>
    <p class="verdict-note">
      Demand compared in this run: <strong>${escapeHtml(formatKips(result.demand.selectedDemand))}</strong>.
      Controlling state: <strong>${escapeHtml(controllingLabel)}</strong> with ${escapeHtml(methodLabel)} =
      <strong>${escapeHtml(controllingStrength)}</strong>.
    </p>
  `;
}

function renderGeometry(result) {
  geometry.innerHTML = `
    <article class="metric-card">
      <span class="metric-label">Gross area, Ag</span>
      <strong class="metric-value">${escapeHtml(formatArea(result.geometry.grossArea))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Net area, An</span>
      <strong class="metric-value">${escapeHtml(formatArea(result.geometry.netArea))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Effective net area, Ae</span>
      <strong class="metric-value">${escapeHtml(formatArea(result.geometry.effectiveNetArea))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Net shear area, Anv</span>
      <strong class="metric-value">${escapeHtml(formatArea(result.geometry.netShearArea))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Clear edge distance, Lc</span>
      <strong class="metric-value">${escapeHtml(`${formatNumber(result.geometry.clearEdgeDistance, 3)} in`)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Hole minus pin clearance</span>
      <strong class="metric-value">${escapeHtml(`${formatNumber(result.geometry.holeClearance, 4)} in`)}</strong>
    </article>
  `;
}

function renderChecks(result) {
  const orderedChecks = [...result.checks].sort((left, right) => right.sortRatio - left.sortRatio);
  const strengthLabel = result.inputs.designMethod === "LRFD" ? "phi Rn" : "Rn / Omega";

  availableLabel.textContent = `${strengthLabel} shown on each card`;
  checks.innerHTML = orderedChecks
    .map((check) => {
      const factorText = `${check.factorLabel} = ${formatNumber(check.factorValue, 2)}`;
      const detailLines = [
        `<li>${escapeHtml(check.details.equation)}</li>`,
        ...Object.entries(check.details)
          .filter(([key]) => key !== "equation")
          .map(([key, value]) => {
            const detailLabel = DETAIL_LABELS[key] || key;
            const displayValue = typeof value === "number" ? formatNumber(value, 3) : value;
            return `<li>${escapeHtml(`${detailLabel} = ${displayValue}`)}</li>`;
          })
      ].join("");

      return `
        <article class="check-card ${escapeHtml(check.status)}">
          <div class="check-top">
            <div>
              <h4 class="check-title">${escapeHtml(check.label)}</h4>
              <p class="check-meta">${escapeHtml(check.spec)} | factor: ${escapeHtml(factorText)}</p>
            </div>
            <div class="badge ${escapeHtml(check.status)}">${escapeHtml(check.status)}</div>
          </div>
          <p class="check-copy">
            ${escapeHtml(formatRatio(check.ratio))}${check.isApproximate ? " | proxy" : ""}
          </p>
          <div class="check-strength">
            <div class="strength-box">
              <span>${escapeHtml(check.availableExpression)}</span>
              <strong>${escapeHtml(formatKips(check.available))}</strong>
            </div>
            <div class="strength-box">
              <span>Nominal strength, Rn</span>
              <strong>${escapeHtml(formatKips(check.nominal))}</strong>
            </div>
            <div class="strength-box">
              <span>Factor used</span>
              <strong>${escapeHtml(factorText)}</strong>
            </div>
          </div>
          <ul class="detail-list">${detailLines}</ul>
        </article>
      `;
    })
    .join("");
}

function renderMessages(result) {
  const blocks = [
    ...result.warnings.map((warning) => ({ type: "warning", text: warning })),
    ...result.advisories.map((advisory) => ({ type: "info", text: advisory }))
  ];

  messages.innerHTML = blocks
    .map((block) => `<article class="message ${escapeHtml(block.type)}">${escapeHtml(block.text)}</article>`)
    .join("");
}

function renderSummaryStrip(result) {
  helperDemandValue.textContent = formatKips(result.demand.helperDemand);
  selectedDemandValue.textContent = formatKips(result.demand.selectedDemand);
  methodValue.textContent = result.inputs.designMethod;

  if (!result.controllingCheck) {
    safetyFactorValue.textContent = "--";
    safetyFactorCopy.textContent = "Available / demand";
    controllingValue.textContent = "--";
    controllingCopy.textContent = "No check could be resolved from the current inputs.";
    return;
  }

  const safetyFactor = result.demand.selectedDemand > 0
    ? result.controllingCheck.available / result.demand.selectedDemand
    : null;
  const factorText = `${result.controllingCheck.factorLabel} = ${formatNumber(result.controllingCheck.factorValue, 2)}`;

  safetyFactorValue.textContent = safetyFactor === null ? "--" : formatNumber(safetyFactor, 2);
  safetyFactorCopy.textContent = `${result.inputs.designMethod} | ${factorText}`;
  controllingValue.textContent = result.controllingCheck.label;
  controllingCopy.textContent = `${formatRatio(result.controllingCheck.ratio)} | ${formatKips(result.controllingCheck.available)} available | ${factorText}`;
}

function renderDiagram(result) {
  const widthIn = Math.max(result.inputs.width, result.inputs.holeDiameter + 0.75);
  const edgeIn = Math.max(result.inputs.edgeDistance, result.inputs.holeDiameter / 2 + 0.375);
  const holeIn = Math.max(result.inputs.holeDiameter, 0.5);
  const pinIn = clamp(result.inputs.pinDiameter, 0.25, holeIn);
  const thicknessIn = Math.max(result.inputs.thickness, 0.25);
  const bodyDepthIn = Math.max(widthIn * 0.85, edgeIn + holeIn * 0.6 + 1.5);
  const overallHeightIn = Math.max(widthIn / 2 + bodyDepthIn, edgeIn + holeIn / 2 + 2.5);
  const maxHalfWidthPx = 84;
  const maxHeightPx = 214;
  const scale = clamp(
    Math.min((maxHalfWidthPx * 2) / widthIn, maxHeightPx / overallHeightIn),
    5,
    18
  );
  const cx = 170;
  const topY = 46;
  const halfWidth = (widthIn * scale) / 2;
  const arcCenterY = topY + halfWidth;
  const bottomY = topY + overallHeightIn * scale;
  const holeRadius = clamp((holeIn * scale) / 2, 9, 28);
  const holeCenterY = clamp(topY + edgeIn * scale, topY + holeRadius + 8, bottomY - holeRadius - 22);
  const pinRadius = clamp(holeRadius * (pinIn / holeIn), 6, holeRadius - 2);
  const widthDimY = Math.min(bottomY + 22, 330);
  const edgeDimX = Math.min(cx + halfWidth + 34, 298);
  const dhDimY = Math.max(topY + 16, holeCenterY - holeRadius - 18);
  const tInsetX = 314;
  const tInsetY = 254;
  const thicknessViz = clamp(thicknessIn * 10, 10, 24);
  const lugPath = [
    `M ${cx - halfWidth} ${bottomY}`,
    `L ${cx - halfWidth} ${arcCenterY}`,
    `A ${halfWidth} ${halfWidth} 0 0 1 ${cx + halfWidth} ${arcCenterY}`,
    `L ${cx + halfWidth} ${bottomY}`,
    "Z"
  ].join(" ");

  diagram.innerHTML = `
    <defs>
      <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#66717d"></path>
      </marker>
    </defs>
    <rect x="12" y="12" width="396" height="336" rx="22" fill="#f9f5ec" stroke="rgba(53, 64, 77, 0.12)"></rect>
    <line x1="28" y1="${holeCenterY}" x2="320" y2="${holeCenterY}" stroke="#8b877f" stroke-width="2" stroke-dasharray="8 8"></line>
    <line x1="${cx}" y1="18" x2="${cx}" y2="338" stroke="#8b877f" stroke-width="2" stroke-dasharray="8 8"></line>
    <path d="${lugPath}" fill="#f7f4ec" stroke="#121416" stroke-width="4"></path>
    <circle cx="${cx}" cy="${holeCenterY}" r="${holeRadius}" fill="#fffaf0" stroke="#121416" stroke-width="4"></circle>
    <circle cx="${cx}" cy="${holeCenterY}" r="${pinRadius}" fill="none" stroke="#4d545e" stroke-width="3"></circle>
    <line x1="${cx - halfWidth}" y1="${bottomY}" x2="${cx - halfWidth}" y2="${widthDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx + halfWidth}" y1="${bottomY}" x2="${cx + halfWidth}" y2="${widthDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx - halfWidth}" y1="${widthDimY}" x2="${cx + halfWidth}" y2="${widthDimY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${cx}" y="${widthDimY - 8}" text-anchor="middle" font-size="15" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">b = ${formatNumber(result.inputs.width, 3)} in</text>
    <line x1="${cx + 6}" y1="${topY}" x2="${edgeDimX}" y2="${topY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx + holeRadius + 6}" y1="${holeCenterY}" x2="${edgeDimX}" y2="${holeCenterY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${edgeDimX}" y1="${topY}" x2="${edgeDimX}" y2="${holeCenterY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${edgeDimX + 8}" y="${topY + (holeCenterY - topY) / 2 + 4}" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">e = ${formatNumber(result.inputs.edgeDistance, 3)} in</text>
    <line x1="${cx - holeRadius}" y1="${holeCenterY}" x2="${cx - holeRadius}" y2="${dhDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx + holeRadius}" y1="${holeCenterY}" x2="${cx + holeRadius}" y2="${dhDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx - holeRadius}" y1="${dhDimY}" x2="${cx + holeRadius}" y2="${dhDimY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${cx}" y="${dhDimY - 8}" text-anchor="middle" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">dh = ${formatNumber(result.inputs.holeDiameter, 3)} in</text>
    <text x="${cx + holeRadius + 14}" y="${holeCenterY + 6}" font-size="13" font-family="Aptos, Segoe UI, sans-serif" fill="#4d545e">dp = ${formatNumber(result.inputs.pinDiameter, 3)} in</text>
    <rect x="${tInsetX - 14}" y="${tInsetY - 30}" width="70" height="62" rx="12" fill="rgba(255,255,255,0.72)" stroke="rgba(53, 64, 77, 0.12)"></rect>
    <line x1="${tInsetX}" y1="${tInsetY - 16}" x2="${tInsetX}" y2="${tInsetY + 16}" stroke="#121416" stroke-width="4"></line>
    <line x1="${tInsetX + thicknessViz}" y1="${tInsetY - 16}" x2="${tInsetX + thicknessViz}" y2="${tInsetY + 16}" stroke="#121416" stroke-width="4"></line>
    <line x1="${tInsetX}" y1="${tInsetY + 22}" x2="${tInsetX + thicknessViz}" y2="${tInsetY + 22}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${tInsetX + thicknessViz / 2}" y="${tInsetY - 20}" text-anchor="middle" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">t = ${formatNumber(result.inputs.thickness, 3)} in</text>
  `;
}

function render() {
  updateDemandMode();
  const result = calculateLiftingLug(readInputs());
  renderSummaryStrip(result);
  renderVerdict(result);
  renderGeometry(result);
  renderChecks(result);
  renderMessages(result);
  renderDiagram(result);
}

form.addEventListener("input", render);
form.addEventListener("change", render);

applyDefaults();
render();
