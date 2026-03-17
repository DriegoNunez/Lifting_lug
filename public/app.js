import { calculateLiftingLug } from "./lifting-lug-engine.js";

const DEFAULT_INPUTS = {
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

const form = document.querySelector("[data-form]");
const designLoadValue = document.querySelector("[data-design-load]");
const governingCapacityValue = document.querySelector("[data-governing-capacity]");
const reserveRatioValue = document.querySelector("[data-reserve-ratio]");
const shearReductionValue = document.querySelector("[data-shear-reduction]");
const governingModeValue = document.querySelector("[data-governing-mode]");
const governingCopy = document.querySelector("[data-governing-copy]");
const verdict = document.querySelector("[data-verdict]");
const geometry = document.querySelector("[data-geometry]");
const allowables = document.querySelector("[data-allowables]");
const checks = document.querySelector("[data-checks]");
const messages = document.querySelector("[data-messages]");
const diagram = document.querySelector("[data-diagram]");

function formatNumber(value, maximumFractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function formatKips(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 3)} kip` : "Not checked";
}

function formatStress(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 3)} ksi` : "--";
}

function formatLength(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 3)} in` : "Not checked";
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${formatNumber(value, 2)}x` : "Not checked";
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
    if (field) {
      field.value = String(value);
    }
  });
}

function readInputs() {
  return {
    elasticModulus: form.elements.namedItem("elasticModulus").value,
    baseFy: form.elements.namedItem("baseFy").value,
    baseFu: form.elements.namedItem("baseFu").value,
    lugFy: form.elements.namedItem("lugFy").value,
    lugFu: form.elements.namedItem("lugFu").value,
    materialAbovePin: form.elements.namedItem("materialAbovePin").value,
    holeDiameter: form.elements.namedItem("holeDiameter").value,
    pinDiameter: form.elements.namedItem("pinDiameter").value,
    materialBelowHole: form.elements.namedItem("materialBelowHole").value,
    lugThickness: form.elements.namedItem("lugThickness").value,
    designLoad: form.elements.namedItem("designLoad").value,
    outOfPlaneAngleDeg: form.elements.namedItem("outOfPlaneAngleDeg").value,
    shearPlaneAngleDeg: form.elements.namedItem("shearPlaneAngleDeg").value,
    nominalDesignFactor: form.elements.namedItem("nominalDesignFactor").value,
    tensionRuptureOmega: form.elements.namedItem("tensionRuptureOmega").value
  };
}

function renderVerdict(result) {
  const controlling = result.controllingCheck;
  const verdictClass = result.summary.allPass ? "pass" : "fail";
  const title = result.summary.allPass
    ? "Current inputs exceed the design load for every numeric failure mode"
    : "At least one failure mode falls at or below the design load";
  const note = controlling
    ? `Governing workbook mode: ${controlling.label} with P_allow = ${formatKips(controlling.allowable)} against a design load of ${formatKips(result.loading.designLoad)}.`
    : "No numeric governing mode is available from the current inputs.";

  verdict.className = `verdict-card ${verdictClass}`;
  verdict.innerHTML = `
    <h3 class="verdict-title">${escapeHtml(title)}</h3>
    <p class="verdict-note">${escapeHtml(note)}</p>
  `;
}

function renderSummaryStrip(result) {
  const controlling = result.controllingCheck;
  const reserveRatio = controlling && result.loading.designLoad > 0
    ? controlling.allowable / result.loading.designLoad
    : null;

  designLoadValue.textContent = formatKips(result.loading.designLoad);
  governingCapacityValue.textContent = controlling ? formatKips(controlling.allowable) : "--";
  reserveRatioValue.textContent = formatRatio(reserveRatio);
  shearReductionValue.textContent = formatLength(result.loading.shearPlaneReduction);
  governingModeValue.textContent = controlling ? controlling.label : "Not checked";
  governingCopy.textContent = controlling
    ? `${escapeHtml(controlling.reference)} | margin = ${formatKips(controlling.margin)}`
    : "No governing failure mode could be resolved from the current inputs.";
}

function renderGeometry(result) {
  geometry.innerHTML = `
    <article class="metric-card">
      <span class="metric-label">Radius, r</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.radius))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Side material, b_e</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.sideMaterial))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Base total, B_tot</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.baseTotal))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Total height, H</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.totalHeight))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Effective width, b_e,eff</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.effectiveTensionWidth))}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Shear area, A_sf</span>
      <strong class="metric-value">${escapeHtml(`${formatNumber(result.geometry.shearArea, 3)} in2`)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Plastic section modulus</span>
      <strong class="metric-value">${escapeHtml(`${formatNumber(result.geometry.plasticSectionModulus, 3)} in3`)}</strong>
    </article>
    <article class="metric-card">
      <span class="metric-label">Weak-axis lever arm</span>
      <strong class="metric-value">${escapeHtml(formatLength(result.geometry.outOfPlaneLeverArm))}</strong>
    </article>
  `;
}

function renderAllowables(result) {
  allowables.innerHTML = result.allowables
    .map((item) => `
      <article class="allowable-card">
        <span class="metric-label">${escapeHtml(item.label)}</span>
        <strong class="metric-value">${escapeHtml(formatStress(item.allowableStress))}</strong>
        <p class="allowable-meta">${escapeHtml(item.reference)}</p>
        <p class="allowable-meta">
          ${escapeHtml(item.safetyFactor === null ? "Workbook leaves Omega blank" : `Safety factor = ${formatNumber(item.safetyFactor, 3)}`)}
        </p>
      </article>
    `)
    .join("");
}

function renderChecks(result) {
  checks.innerHTML = result.checks
    .map((check) => {
      const details = Object.entries(check.details)
        .map(([key, value]) => `<li>${escapeHtml(`${key}: ${Number.isFinite(value) ? formatNumber(value, 3) : value}`)}</li>`)
        .join("");

      return `
        <article class="check-card ${escapeHtml(check.status)}">
          <div class="check-top">
            <div>
              <h4 class="check-title">${escapeHtml(check.label)}</h4>
              <p class="check-meta">${escapeHtml(check.reference)}</p>
            </div>
            <div class="badge ${escapeHtml(check.status)}">${escapeHtml(check.status)}</div>
          </div>
          <p class="check-copy">${escapeHtml(check.equation)}</p>
          <div class="strength-box">
            <span>P_allow</span>
            <strong>${escapeHtml(formatKips(check.allowable))}</strong>
          </div>
          <div class="strength-box">
            <span>Reserve ratio</span>
            <strong>${escapeHtml(formatRatio(check.ratio))}</strong>
          </div>
          <div class="strength-box">
            <span>Margin to load</span>
            <strong>${escapeHtml(formatKips(check.margin))}</strong>
          </div>
          <ul class="detail-list">${details}</ul>
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

function renderDiagram(result) {
  const baseWidthIn = Math.max(result.geometry.baseTotal, result.inputs.holeDiameter + 1);
  const totalHeightIn = Math.max(result.geometry.totalHeight, result.inputs.holeDiameter + 2);
  const radiusIn = Math.max(result.geometry.radius, result.inputs.holeDiameter / 2 + 0.5);
  const holeDiameterIn = Math.max(result.inputs.holeDiameter, 0.5);
  const thicknessIn = Math.max(result.inputs.lugThickness, 0.25);
  const scale = clamp(Math.min(180 / baseWidthIn, 250 / totalHeightIn), 5, 16);
  const cx = 170;
  const topY = 42;
  const holeRadius = (holeDiameterIn * scale) / 2;
  const outerRadius = radiusIn * scale;
  const holeCenterY = topY + outerRadius;
  const rectBottomY = holeCenterY + result.inputs.materialBelowHole * scale;
  const halfWidth = (baseWidthIn * scale) / 2;
  const widthDimY = Math.min(rectBottomY + 24, 334);
  const edgeDimX = Math.min(cx + halfWidth + 34, 314);
  const topArcLeft = cx - halfWidth;
  const topArcRight = cx + halfWidth;
  const pinRadius = holeRadius * clamp(result.inputs.pinDiameter / result.inputs.holeDiameter, 0.35, 1);
  const tInsetX = 318;
  const tInsetY = 266;
  const thicknessViz = clamp(thicknessIn * 12, 10, 26);
  const outerPath = [
    `M ${topArcLeft} ${rectBottomY}`,
    `L ${topArcLeft} ${holeCenterY}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${topArcRight} ${holeCenterY}`,
    `L ${topArcRight} ${rectBottomY}`,
    "Z"
  ].join(" ");

  diagram.innerHTML = `
    <defs>
      <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#66717d"></path>
      </marker>
    </defs>
    <rect x="12" y="12" width="396" height="336" rx="22" fill="#f9f5ec" stroke="rgba(53, 64, 77, 0.12)"></rect>
    <line x1="${cx}" y1="20" x2="${cx}" y2="340" stroke="#8b877f" stroke-width="2" stroke-dasharray="8 8"></line>
    <path d="${outerPath}" fill="#f7f4ec" stroke="#121416" stroke-width="4"></path>
    <circle cx="${cx}" cy="${holeCenterY}" r="${holeRadius}" fill="#fffaf0" stroke="#121416" stroke-width="4"></circle>
    <circle cx="${cx}" cy="${holeCenterY}" r="${pinRadius}" fill="none" stroke="#4d545e" stroke-width="3"></circle>
    <line x1="${topArcLeft}" y1="${rectBottomY}" x2="${topArcLeft}" y2="${widthDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${topArcRight}" y1="${rectBottomY}" x2="${topArcRight}" y2="${widthDimY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${topArcLeft}" y1="${widthDimY}" x2="${topArcRight}" y2="${widthDimY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${cx}" y="${widthDimY - 8}" text-anchor="middle" font-size="15" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">B_tot = ${formatNumber(result.geometry.baseTotal, 3)} in</text>
    <line x1="${cx + holeRadius + 8}" y1="${topY}" x2="${edgeDimX}" y2="${topY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx + holeRadius + 8}" y1="${holeCenterY}" x2="${edgeDimX}" y2="${holeCenterY}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${edgeDimX}" y1="${topY}" x2="${edgeDimX}" y2="${holeCenterY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${edgeDimX + 8}" y="${topY + (holeCenterY - topY) / 2 + 4}" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">a = ${formatNumber(result.inputs.materialAbovePin, 3)} in</text>
    <line x1="${cx - holeRadius}" y1="${holeCenterY}" x2="${cx - holeRadius}" y2="${topY - 4}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx + holeRadius}" y1="${holeCenterY}" x2="${cx + holeRadius}" y2="${topY - 4}" stroke="#66717d" stroke-width="2"></line>
    <line x1="${cx - holeRadius}" y1="${topY - 4}" x2="${cx + holeRadius}" y2="${topY - 4}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${cx}" y="${topY - 12}" text-anchor="middle" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">D_h = ${formatNumber(result.inputs.holeDiameter, 3)} in</text>
    <line x1="${topArcRight + 10}" y1="${holeCenterY}" x2="${topArcRight + 10}" y2="${rectBottomY}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${topArcRight + 18}" y="${holeCenterY + (rectBottomY - holeCenterY) / 2 + 4}" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">h = ${formatNumber(result.inputs.materialBelowHole, 3)} in</text>
    <text x="${cx + holeRadius + 12}" y="${holeCenterY + 6}" font-size="13" font-family="Aptos, Segoe UI, sans-serif" fill="#4d545e">D_pin = ${formatNumber(result.inputs.pinDiameter, 3)} in</text>
    <rect x="${tInsetX - 14}" y="${tInsetY - 30}" width="72" height="62" rx="12" fill="rgba(255,255,255,0.72)" stroke="rgba(53, 64, 77, 0.12)"></rect>
    <line x1="${tInsetX}" y1="${tInsetY - 16}" x2="${tInsetX}" y2="${tInsetY + 16}" stroke="#121416" stroke-width="4"></line>
    <line x1="${tInsetX + thicknessViz}" y1="${tInsetY - 16}" x2="${tInsetX + thicknessViz}" y2="${tInsetY + 16}" stroke="#121416" stroke-width="4"></line>
    <line x1="${tInsetX}" y1="${tInsetY + 22}" x2="${tInsetX + thicknessViz}" y2="${tInsetY + 22}" stroke="#66717d" stroke-width="2" marker-start="url(#dim-arrow)" marker-end="url(#dim-arrow)"></line>
    <text x="${tInsetX + thicknessViz / 2}" y="${tInsetY - 20}" text-anchor="middle" font-size="14" font-family="Aptos, Segoe UI, sans-serif" fill="#35404d">t = ${formatNumber(result.inputs.lugThickness, 3)} in</text>
  `;
}

function render() {
  const result = calculateLiftingLug(readInputs());
  renderSummaryStrip(result);
  renderVerdict(result);
  renderGeometry(result);
  renderAllowables(result);
  renderChecks(result);
  renderMessages(result);
  renderDiagram(result);
}

form.addEventListener("input", render);
form.addEventListener("change", render);

applyDefaults();
render();
