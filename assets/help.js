(function () {
  "use strict";

  if (typeof document === "undefined") {
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAuditLogic);
  } else {
    renderAuditLogic();
  }

  function renderAuditLogic() {
    const container = document.getElementById("auditLogicContent");

    if (!container) {
      return;
    }

    const app = globalThis.BallastWeightApp;
    const buildAuditReference = app
      && app.helpers
      && typeof app.helpers.buildAuditReference === "function"
      ? app.helpers.buildAuditReference
      : null;

    if (!buildAuditReference) {
      container.innerHTML = `<p class="helper-text">Calculation logic could not be loaded from the app.</p>`;
      return;
    }

    const audit = buildAuditReference();
    const ballastCountLabels = new Map(
      audit.ballastOptions.map((option) => [option.countValue, option.label])
    );

    container.innerHTML = `
      <div class="help-note">
        This section is rendered from the same thresholds, ballast options, and formulas used by the calculator.
      </div>

      <section class="help-logic__section">
        <h3>Core Formulae</h3>
        <p class="help-logic__formula">${escapeHtml(audit.formulas.payload)}</p>
        <p class="help-logic__formula">${escapeHtml(audit.formulas.aum)}</p>
        <p class="help-logic__caption">
          Maximum Aircraft All-Up Mass is <strong>${escapeHtml(String(audit.constants.maxAum))} kg</strong>.
          Approach speed is <strong>${escapeHtml(String(audit.constants.approachSpeedBelowThreshold))} kt</strong>
          when AUM is below <strong>${escapeHtml(String(audit.constants.approachSpeedThreshold))} kg</strong>,
          otherwise <strong>${escapeHtml(String(audit.constants.approachSpeedAtOrAboveThreshold))} kt</strong>.
        </p>
      </section>

      <section class="help-logic__section">
        <h3>Single-Passenger Checks</h3>
        <ul class="help-list">
          <li>Maximum weight in either seat: <strong>${escapeHtml(String(audit.constants.seatMaximumWeight))} kg</strong>.</li>
          <li>Front seat minimum passenger weight: <strong>${escapeHtml(String(audit.constants.frontSeatMinimumWeight))} kg</strong>.</li>
          <li>Aircraft Commander allocation limit in Multiple Passenger mode: <strong>${escapeHtml(String(audit.constants.commanderAllocationLimit))} kg</strong>.</li>
        </ul>
      </section>

      <section class="help-logic__section">
        <h3>Ballast Options</h3>
        <div class="table-shell">
          <table class="data-table">
            <thead>
              <tr>
                <th>Selection</th>
                <th>Ballast Count</th>
                <th>Ballast Mass (kg)</th>
              </tr>
            </thead>
            <tbody>
              ${audit.ballastOptions.map((option) => `
                <tr>
                  <td>${escapeHtml(option.label)}</td>
                  <td>${escapeHtml(option.countLabel)}</td>
                  <td>${escapeHtml(String(option.mass))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="help-logic__section">
        <h3>Passenger Ballast Rule Table</h3>
        <div class="table-shell">
          <table class="data-table">
            <thead>
              <tr>
                <th>Passenger Weight</th>
                <th>Required Ballast</th>
                <th>Permitted Ballast</th>
                <th>Allowed Aircraft Ballast Settings</th>
                <th>Single-Passenger Output</th>
                <th>Multiple-Passenger Summary</th>
              </tr>
            </thead>
            <tbody>
              ${audit.ballastRules.map((rule) => `
                <tr>
                  <td>${escapeHtml(rule.rangeLabel)}</td>
                  <td>${escapeHtml(rule.required)}</td>
                  <td>${escapeHtml(rule.permitted)}</td>
                  <td>${escapeHtml(formatAllowedBallastCounts(rule.allowedBallastCounts, ballastCountLabels))}</td>
                  <td>${escapeHtml(rule.singleStatus)}</td>
                  <td>${escapeHtml(rule.summaryStatus)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="help-logic__section">
        <h3>Allocation Eligibility</h3>
        <p class="help-logic__formula">${escapeHtml(audit.formulas.allocationAum)}</p>
        <p class="help-logic__caption">${escapeHtml(audit.formulas.allocationRule)}</p>
      </section>
    `;
  }

  function formatAllowedBallastCounts(counts, labelsByCount) {
    if (!Array.isArray(counts) || !counts.length) {
      return "Not allocatable";
    }

    return counts
      .map((count) => labelsByCount.get(count) || String(count))
      .join(", ");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}());
