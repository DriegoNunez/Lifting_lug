import { DEFAULT_INPUTS, WORKBOOK_METADATA, calculateLiftingLug } from "./lifting-lug-engine.js";

const STORAGE_KEY = "lifting-lug-saved-projects";

const titleNode = document.querySelector("[data-workbook-title]");
const subtitleNode = document.querySelector("[data-workbook-subtitle]");
const comparisonNode = document.querySelector("[data-comparison]");
const materialSectionNode = document.querySelector("[data-material-section]");
const geometryFiguresNode = document.querySelector("[data-geometry-figures]");
const geometrySectionNode = document.querySelector("[data-geometry-section]");
const loadingSectionNode = document.querySelector("[data-loading-section]");
const allowablesSectionNode = document.querySelector("[data-allowables-section]");
const failureModesNode = document.querySelector("[data-failure-modes]");
const summarySectionNode = document.querySelector("[data-summary-section]");
const notesSectionNode = document.querySelector("[data-notes-section]");
const metadataInputs = [...document.querySelectorAll("[data-meta-input]")];
const savedProjectsSelect = document.querySelector("[data-saved-projects]");
const saveProjectButton = document.querySelector("[data-save-project]");
const loadProjectButton = document.querySelector("[data-load-project]");
const deleteProjectButton = document.querySelector("[data-delete-project]");
const newProjectButton = document.querySelector("[data-new-project]");
const saveStatusNode = document.querySelector("[data-save-status]");

const defaultMetadata = {
  project: WORKBOOK_METADATA.project,
  projectNumber: WORKBOOK_METADATA.projectNumber,
  company: WORKBOOK_METADATA.company,
  workbookDate: WORKBOOK_METADATA.workbookDate
};

function formatNumber(value, maximumFractionDigits = 3) {
  if (!Number.isFinite(value)) {
    return "Do not check this";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

function formatCellValue(value, unit) {
  if (!Number.isFinite(value)) {
    return "Do not check this";
  }

  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSaveStatus(message) {
  saveStatusNode.textContent = message;
}

function readMetadata() {
  return Object.fromEntries(
    metadataInputs.map((field) => [field.dataset.metaInput, field.value.trim()])
  );
}

function applyMetadata(metadata) {
  metadataInputs.forEach((field) => {
    const key = field.dataset.metaInput;
    field.value = metadata[key] ?? "";
  });
}

function readInputs() {
  return Object.fromEntries(
    Object.keys(DEFAULT_INPUTS).map((name) => {
      const field = document.querySelector(`[data-input-name="${name}"]`);
      return [name, field ? field.value : DEFAULT_INPUTS[name]];
    })
  );
}

function applyInputs(inputValues) {
  Object.entries(DEFAULT_INPUTS).forEach(([name, defaultValue]) => {
    const field = document.querySelector(`[data-input-name="${name}"]`);

    if (field) {
      field.value = inputValues[name] ?? defaultValue;
    }
  });
}

function getSavedProjects() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function buildProjectLabel(project) {
  const name = project.metadata.project || "Untitled Project";
  const projectNumber = project.metadata.projectNumber ? ` | ${project.metadata.projectNumber}` : "";
  return `${name}${projectNumber} | Saved ${project.savedAt}`;
}

function refreshSavedProjectsList(selectedId = "") {
  const projects = getSavedProjects();
  savedProjectsSelect.innerHTML = `
    <option value="">Select a saved calculation</option>
    ${projects.map((project) => `
      <option value="${escapeHtml(project.id)}" ${project.id === selectedId ? "selected" : ""}>
        ${escapeHtml(buildProjectLabel(project))}
      </option>
    `).join("")}
  `;
}

function createSnapshot() {
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toLocaleString(),
    metadata: readMetadata(),
    inputs: readInputs()
  };
}

function resetProject() {
  applyMetadata(defaultMetadata);
  applyInputs(DEFAULT_INPUTS);
  savedProjectsSelect.value = "";
  setSaveStatus("Started a new unsaved project.");
  render();
}

function saveCurrentProject() {
  const snapshot = createSnapshot();
  const projects = getSavedProjects();
  const activeId = savedProjectsSelect.value;
  const index = projects.findIndex((project) => project.id === activeId);

  if (index >= 0) {
    snapshot.id = projects[index].id;
    projects[index] = snapshot;
  } else {
    projects.unshift(snapshot);
  }

  saveProjects(projects);
  refreshSavedProjectsList(snapshot.id);
  setSaveStatus(`Saved "${snapshot.metadata.project || "Untitled Project"}".`);
}

function loadSelectedProject() {
  const activeId = savedProjectsSelect.value;
  const project = getSavedProjects().find((item) => item.id === activeId);

  if (!project) {
    setSaveStatus("Select a saved calculation to load.");
    return;
  }

  applyMetadata(project.metadata);
  applyInputs(project.inputs);
  render();
  setSaveStatus(`Loaded "${project.metadata.project || "Untitled Project"}".`);
}

function deleteSelectedProject() {
  const activeId = savedProjectsSelect.value;

  if (!activeId) {
    setSaveStatus("Select a saved calculation to delete.");
    return;
  }

  const projects = getSavedProjects().filter((project) => project.id !== activeId);
  saveProjects(projects);
  refreshSavedProjectsList();
  setSaveStatus("Deleted the selected saved calculation.");
}

function renderWorkbookRow(row) {
  const inputMarkup = row.kind === "input"
    ? `
      <input
        class="sheet-input"
        type="number"
        step="any"
        data-input-name="${escapeHtml(row.inputName)}"
        value="${escapeHtml(row.inputValue)}"
      >
    `
    : `<span class="formula-chip">${escapeHtml(row.formula || "-")}</span>`;

  const resultMarkup = row.kind === "input"
    ? formatCellValue(Number(row.result), row.unit)
    : formatCellValue(row.result, row.unit);

  return `
    <tr class="${row.kind === "input" ? "input-row" : "derived-row"}">
      <td class="cell-ref">${escapeHtml(row.cell)}</td>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.symbol)}</td>
      <td>${inputMarkup}</td>
      <td>${escapeHtml(resultMarkup)}</td>
      <td>${escapeHtml(row.note || "")}</td>
    </tr>
  `;
}

function renderWorkbookTable(columns, rows) {
  return `
    <div class="sheet-scroll">
      <table class="sheet-table">
        <thead>
          <tr>
            ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMetadata(result) {
  titleNode.textContent = result.metadata.title;
  subtitleNode.textContent = result.metadata.subtitle;
}

function renderComparisonBanner(result) {
  const controlling = result.sections.failureModes.find((mode) => mode.controls);
  const differences = [
    "Current HTML was organized as custom cards; the workbook is a numbered, row-driven engineering sheet.",
    "The old app hid helper cells; the refactor now surfaces workbook intermediates like r, b_e, B_tot, H, Z', A_sf, and Z_plastic.",
    "The new page keeps workbook section order, failure-mode flow, summary table, notes, and workbook figures."
  ];

  comparisonNode.innerHTML = `
    <div>
      <h2>HTML vs. Excel</h2>
      <ul class="summary-list">
        ${differences.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
    <div class="comparison-stats">
      <div>
        <span>Design load</span>
        <strong>${escapeHtml(formatCellValue(result.inputs.designLoad, "kip"))}</strong>
      </div>
      <div>
        <span>Governing capacity</span>
        <strong>${escapeHtml(formatCellValue(result.summary.governingAllowable, "kip"))}</strong>
      </div>
      <div>
        <span>Governing mode</span>
        <strong>${escapeHtml(controlling ? controlling.summaryLabel : "No governing failure mode")}</strong>
      </div>
    </div>
  `;
}

function renderMaterialSection(result) {
  materialSectionNode.innerHTML = renderWorkbookTable(
    ["Cell", "Parameter", "Symbol", "Input / Formula", "Result", "Notes"],
    result.sections.material.map(renderWorkbookRow)
  );
}

function renderGeometryFigures() {
  geometryFiguresNode.innerHTML = [1, 2, 3]
    .map((index) => `
      <figure class="figure-card">
        <img src="./workbook-media/image${index}.png" alt="Workbook geometry figure ${index}">
      </figure>
    `)
    .join("");
}

function renderGeometrySection(result) {
  geometrySectionNode.innerHTML = renderWorkbookTable(
    ["Cell", "Parameter", "Symbol", "Input / Formula", "Result", "Notes"],
    result.sections.geometry.map(renderWorkbookRow)
  );
}

function renderLoadingSection(result) {
  loadingSectionNode.innerHTML = renderWorkbookTable(
    ["Cell", "Load / Derived Term", "Symbol", "Input / Formula", "Result", "Notes"],
    result.sections.loading.map(renderWorkbookRow)
  );
}

function renderAllowablesSection(result) {
  const rows = result.sections.allowables.map((row) => `
    <tr>
      <td class="cell-ref">${escapeHtml(row.cell)}</td>
      <td>${escapeHtml(row.stressType)}</td>
      <td>${escapeHtml(row.reference)}</td>
      <td>${escapeHtml(formatCellValue(row.allowableStress, row.unit))}</td>
      <td>${row.safetyFactor === null ? "-" : escapeHtml(formatNumber(row.safetyFactor, 3))}</td>
      <td>${escapeHtml(row.note)}</td>
    </tr>
  `);

  allowablesSectionNode.innerHTML = renderWorkbookTable(
    ["Cell", "Stress Type", "Reference", "Allowable Stress", "Safety Factor", "Workbook Note"],
    rows
  ) + `
    <div class="workbook-parameter-block">
      <label class="parameter-card">
        <span>Nominal Design Factor Nd</span>
        <input class="sheet-input" type="number" step="any" data-input-name="nominalDesignFactor" value="${escapeHtml(result.inputs.nominalDesignFactor)}">
      </label>
      <label class="parameter-card">
        <span>Tension Rupture Omega_tens_rupt</span>
        <input class="sheet-input" type="number" step="any" data-input-name="tensionRuptureOmega" value="${escapeHtml(result.inputs.tensionRuptureOmega)}">
      </label>
    </div>
  `;
}

function renderFailureModes(result) {
  failureModesNode.innerHTML = result.sections.failureModes
    .map((mode) => {
      const helperTable = mode.helperRows.length
        ? renderWorkbookTable(
            ["Cell", "Helper Term", "Symbol", "Input / Formula", "Result", "Notes"],
            mode.helperRows.map(renderWorkbookRow)
          )
        : "";

      return `
        <article class="mode-card ${escapeHtml(mode.status)}">
          <div class="mode-heading">
            <div>
              <p class="mode-ref">${escapeHtml(mode.cell)}</p>
              <h3>${escapeHtml(mode.label)}</h3>
              <p class="mode-meta">${escapeHtml(mode.reference)}</p>
            </div>
            <div class="status-pill ${escapeHtml(mode.status)}">${escapeHtml(mode.controls ? "Governs" : mode.status.toUpperCase())}</div>
          </div>

          <div class="mode-body">
            <div class="mode-table">
              ${renderWorkbookTable(
                ["Code Reference", "Workbook Formula", "Translated Equation", "P_allow", "Controls?"],
                [
                  `
                    <tr>
                      <td>${escapeHtml(mode.reference)}</td>
                      <td><span class="formula-chip">${escapeHtml(mode.equation)}</span></td>
                      <td>${escapeHtml(mode.displayEquation)}</td>
                      <td>${escapeHtml(formatCellValue(mode.allowable, "kip"))}</td>
                      <td>${mode.controls ? "<- GOVERNS" : "-"}</td>
                    </tr>
                  `
                ]
              )}
              ${helperTable}
            </div>

            <div class="mode-figures">
              <figure class="figure-card">
                <img src="${escapeHtml(mode.figure.main)}" alt="${escapeHtml(mode.label)} workbook figure">
              </figure>
              ${mode.figure.support.map((src) => `
                <figure class="figure-card support">
                  <img src="${escapeHtml(src)}" alt="${escapeHtml(mode.label)} supporting workbook figure">
                </figure>
              `).join("")}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSummarySection(result) {
  const summaryTable = renderWorkbookTable(
    ["Failure Mode", "Allowable Load (kip)", "OK?"],
    result.sections.summary.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(formatCellValue(row.allowable, "kip"))}</td>
        <td>
          <span class="status-pill ${escapeHtml(row.status)}">${escapeHtml(row.status === "ok" ? "OK" : row.status === "check" ? "Check" : "Do not check")}</span>
        </td>
      </tr>
    `)
  );

  const mappingList = result.mapping
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.workbookSection)}</td>
        <td>${escapeHtml(item.htmlComponent)}</td>
        <td>${escapeHtml(item.codeArea)}</td>
      </tr>
    `)
    .join("");

  const warningList = [...result.warnings, ...result.assumptions]
    .map((message) => `<li>${escapeHtml(message)}</li>`)
    .join("");

  summarySectionNode.innerHTML = `
    <div class="governing-banner ${result.summary.allPass ? "ok" : "check"}">
      <span>Governing allowable capacity P_n_allow</span>
      <strong>${escapeHtml(formatCellValue(result.summary.governingAllowable, "kip"))}</strong>
      <p>${escapeHtml(result.summary.governingMode)}</p>
    </div>

    ${summaryTable}

    <div class="mapping-block">
      <h3>Spreadsheet-to-HTML Mapping</h3>
      ${renderWorkbookTable(["Workbook Section / Cells", "HTML Component", "Code Location"], [mappingList])}
    </div>

    <div class="message-block">
      <h3>Formula Translation Notes</h3>
      <ul class="summary-list">
        <li>Workbook formulas were translated directly into JavaScript using the same helper-cell sequence and naming.</li>
        <li>Each failure mode keeps its workbook formula text, a readable engineering equation, and any supporting helper row used in the Excel tab.</li>
        <li>Numeric governing logic ignores the workbook's text value for FM 6 when Delta_oop = 0, matching the Excel IFERROR behavior.</li>
        ${warningList}
      </ul>
    </div>
  `;
}

function renderNotesSection(result) {
  notesSectionNode.innerHTML = `
    <ol class="notes-list">
      ${result.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
    </ol>
  `;
}

function render() {
  const result = calculateLiftingLug(readInputs());
  renderMetadata(result);
  renderComparisonBanner(result);
  renderMaterialSection(result);
  renderGeometryFigures();
  renderGeometrySection(result);
  renderLoadingSection(result);
  renderAllowablesSection(result);
  renderFailureModes(result);
  renderSummarySection(result);
  renderNotesSection(result);
}

metadataInputs.forEach((field) => {
  field.addEventListener("input", () => {
    setSaveStatus("");
    render();
  });
});

document.addEventListener("input", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches("[data-input-name]")) {
    setSaveStatus("");
    render();
  }
});

saveProjectButton.addEventListener("click", saveCurrentProject);
loadProjectButton.addEventListener("click", loadSelectedProject);
deleteProjectButton.addEventListener("click", deleteSelectedProject);
newProjectButton.addEventListener("click", resetProject);

applyMetadata(defaultMetadata);
refreshSavedProjectsList();
setSaveStatus("Projects are stored in this browser using local storage.");
render();
