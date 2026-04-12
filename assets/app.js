(function (global) {
  "use strict";

  const LOCAL_AIRCRAFT_DATA_URL = "assets/aircraft_weights.csv";
  const DEFAULT_PASSENGER_COUNT = 10;
  const MAX_PASSENGERS = 50;
  const MIN_PASSENGERS = 1;
  const MAX_WEIGHT = 110;
  const OVERWEIGHT_LIMIT = 110;
  const FRONT_SEAT_MIN_WEIGHT = 55;
  const MAX_AUM = 625;
  const APPROACH_SPEED_THRESHOLD = 580;
  const APPROACH_SPEEDS = {
    belowThreshold: 55,
    thresholdOrAbove: 60
  };
  const TRIPETTO_SCRIPT_URLS = [
    "https://cdn.jsdelivr.net/npm/@tripetto/runner",
    "https://cdn.jsdelivr.net/npm/@tripetto/runner-classic",
    "https://cdn.jsdelivr.net/npm/@tripetto/studio"
  ];
  const TRIPETTO_FORM_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiTFQ1V2JpNWZ3b0t2VkxMZWJqZ0dBVlZJMXY5K2MrazI0N3d5VjNRK2t6WT0iLCJkZWZpbml0aW9uIjoiK2V1cDBzVUhwOHpQUHhsOGlzTmxxVk5EVGtwZUh4S3pjenM0UEwvcDJhWT0iLCJ0eXBlIjoiY29sbGVjdCJ9.W16S1Nbg-kifLN4lm86MnbgZJmcluvEUYAJBfGdglrw";
  const BALLAST_OPTIONS = [
    { value: "0", label: "None", mass: 0 },
    { value: "1", label: "One", mass: 7 },
    { value: "2", label: "Two", mass: 15 }
  ];
  const ALLOCATION_TYPES = [
    {
      value: "all-available",
      label: "All Available",
      description: "List every aircraft each passenger can use."
    },
    {
      value: "auto-allocate",
      label: "Auto Allocate",
      description: "Assign one aircraft per passenger and balance counts where possible."
    },
    {
      value: "manual-allocation",
      label: "Manual Allocation",
      description: "Select one eligible aircraft per passenger in the table."
    }
  ];
  const PASSENGER_BALLAST_RULES = [
    {
      min: 0,
      max: 42,
      auditLabel: "Below 42 kg",
      summary: {
        required: "N/A",
        permitted: "0",
        status: "Passenger too light to fly",
        code: "too-light",
        allowedBallastCounts: []
      },
      single: {
        tone: "danger",
        text: "PASSENGER TOO LIGHT TO FLY"
      }
    },
    {
      min: 42,
      max: 55,
      auditLabel: "42 kg to under 55 kg",
      summary: {
        required: "N/A",
        permitted: "N/A",
        status: "Rear seat only",
        code: "rear-only",
        allowedBallastCounts: []
      },
      single: {
        tone: "warning",
        text: "PASSENGER IN REAR SEAT ONLY"
      }
    },
    {
      min: 55,
      max: 63,
      auditLabel: "55 kg to under 63 kg",
      summary: {
        required: "2",
        permitted: "2",
        status: "Two ballast weights must be fitted",
        code: "must-use-two",
        allowedBallastCounts: [2]
      },
      single: {
        tone: "warning",
        text: "TWO Ballast weights MUST be fitted"
      }
    },
    {
      min: 63,
      max: 70,
      auditLabel: "63 kg to under 70 kg",
      summary: {
        required: "At least 1",
        permitted: "1 or 2",
        status: "At least one ballast weight must be fitted",
        code: "must-use-one-or-two",
        allowedBallastCounts: [1, 2]
      },
      single: {
        tone: "warning",
        text: "at least ONE Ballast weight MUST be fitted"
      }
    },
    {
      min: 70,
      max: 95,
      auditLabel: "70 kg to under 95 kg",
      summary: {
        required: "0",
        permitted: "0, 1, or 2",
        status: "Ballast not required",
        code: "ballast-optional-all",
        allowedBallastCounts: [0, 1, 2]
      },
      single: {
        tone: "success",
        text: "Ballast not required, but 1 or 2 may be fitted"
      }
    },
    {
      min: 95,
      max: 103,
      auditLabel: "95 kg to under 103 kg",
      summary: {
        required: "0",
        permitted: "0 or 1",
        status: "Ballast not required",
        code: "ballast-optional-zero-or-one",
        allowedBallastCounts: [0, 1]
      },
      single: {
        tone: "success",
        text: "Ballast not required, but 1 may be fitted"
      }
    },
    {
      min: 103,
      max: 111,
      auditLabel: "103 kg to 110 kg",
      summary: {
        required: "0",
        permitted: "0",
        status: "Ballast not permitted",
        code: "ballast-not-permitted",
        allowedBallastCounts: [0]
      },
      single: {
        tone: "danger",
        text: "Ballast weights are NOT PERMITTED"
      }
    },
    {
      min: 111,
      max: Infinity,
      auditLabel: "Above 110 kg",
      summary: {
        required: "N/A",
        permitted: "0",
        status: "Passenger too heavy to fly",
        code: "too-heavy",
        allowedBallastCounts: []
      },
      single: {
        tone: "danger",
        text: "PASSENGER TOO HEAVY TO FLY"
      }
    }
  ];
  const HOME_SCREEN_PROMPT_STORAGE_KEY = "ballast-home-screen-prompt-seen-v2";
  const MOBILE_SCREEN_QUERY = "(max-width: 699px)";

  const api = {
    helpers: {
      parseCsv,
      normaliseAircraftRows,
      buildBallastSummary,
      buildAuditReference,
      buildMultiSummaryTableModel,
      calculateSingleModel,
      resolveAircraftAllocation,
      getValidAircraftConfigs,
      buildPassengerAllocationOptions,
      autoAllocatePassengers,
      formatWeight,
      getBallastMass
    }
  };

  global.BallastWeightApp = api;

  if (!global.document) {
    return;
  }

  const state = {
    aircraftData: [],
    mode: "single",
    single: {
      aircraft: "",
      commander: "0",
      passenger: "0",
      ballastCount: "0"
    },
    multi: {
      passengerCount: DEFAULT_PASSENGER_COUNT,
      passengers: buildPassengerList(DEFAULT_PASSENGER_COUNT),
      allocationEnabled: false,
      allocationType: "all-available",
      selectedAircraft: [],
      aircraftConfigs: {}
    }
  };

  api.state = state;

  const elements = {};
  let lastFocusedElement = null;
  let tripettoAssetsPromise = null;
  let tripettoFormPromise = null;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    cacheElements();

    if (!elements.modeSingleButton || !elements.modeMultiButton) {
      return;
    }

    bindEvents();
    setMode("single");
    renderPassengerInputs();
    queueHomeScreenPrompt();
    loadAircraftData();
  }

  function cacheElements() {
    elements.loadOverlay = document.getElementById("loadOverlay");
    elements.loadEyebrow = document.getElementById("loadEyebrow");
    elements.loadTitle = document.getElementById("loadTitle");
    elements.loadMessage = document.getElementById("loadMessage");
    elements.retryLoadButton = document.getElementById("retryLoadButton");
    elements.statusBanner = document.getElementById("statusBanner");
    elements.addAircraftButton = document.getElementById("addAircraftButton");
    elements.modeSingleButton = document.getElementById("modeSingleButton");
    elements.modeMultiButton = document.getElementById("modeMultiButton");
    elements.singleModePanel = document.getElementById("singleModePanel");
    elements.multiModePanel = document.getElementById("multiModePanel");
    elements.singleAircraftSelect = document.getElementById("singleAircraftSelect");
    elements.singleCommanderInput = document.getElementById("singleCommanderInput");
    elements.singlePassengerInput = document.getElementById("singlePassengerInput");
    elements.singleBallastSelect = document.getElementById("singleBallastSelect");
    elements.singleCalculations = document.getElementById("singleCalculations");
    elements.singleOutput = document.getElementById("singleOutput");
    elements.altAircraftTable = document.getElementById("altAircraftTable");
    elements.passengerCountInput = document.getElementById("passengerCountInput");
    elements.multiAircraftToggle = document.getElementById("multiAircraftToggle");
    elements.multiAircraftPickerField = document.getElementById("multiAircraftPickerField");
    elements.multiAircraftSelectionCount = document.getElementById("multiAircraftSelectionCount");
    elements.multiAircraftPickerList = document.getElementById("multiAircraftPickerList");
    elements.saveSummaryButton = document.getElementById("saveSummaryButton");
    elements.resetMultiButton = document.getElementById("resetMultiButton");
    elements.passengerInputs = document.getElementById("passengerInputs");
    elements.aircraftConfigCard = document.getElementById("aircraftConfigCard");
    elements.aircraftConfigList = document.getElementById("aircraftConfigList");
    elements.multiAllocationPanel = document.getElementById("multiAllocationPanel");
    elements.multiAllocationTypeOptions = document.getElementById("multiAllocationTypeOptions");
    elements.multiAllocationStats = document.getElementById("multiAllocationStats");
    elements.manualAllocationActions = document.getElementById("manualAllocationActions");
    elements.resetManualAllocationButton = document.getElementById("resetManualAllocationButton");
    elements.multiSummaryTable = document.getElementById("multiSummaryTable");
    elements.aircraftSubmissionModal = document.getElementById("aircraftSubmissionModal");
    elements.aircraftSubmissionCard = document.getElementById("aircraftSubmissionCard");
    elements.aircraftSubmissionCloseButton = document.getElementById("aircraftSubmissionCloseButton");
    elements.tripettoStatus = document.getElementById("tripettoStatus");
    elements.homeScreenPrompt = document.getElementById("homeScreenPrompt");
    elements.homeScreenPromptDismiss = document.getElementById("homeScreenPromptDismiss");
  }

  function bindEvents() {
    elements.retryLoadButton.addEventListener("click", loadAircraftData);
    elements.addAircraftButton.addEventListener("click", openAircraftSubmissionModal);
    elements.aircraftSubmissionCloseButton.addEventListener("click", closeAircraftSubmissionModal);
    elements.aircraftSubmissionModal.addEventListener("click", handleAircraftSubmissionModalClick);
    if (elements.homeScreenPromptDismiss) {
      elements.homeScreenPromptDismiss.addEventListener("click", dismissHomeScreenPrompt);
    }
    document.addEventListener("keydown", handleDocumentKeydown);
    elements.modeSingleButton.addEventListener("click", () => setMode("single"));
    elements.modeMultiButton.addEventListener("click", () => setMode("multi"));

    elements.singleAircraftSelect.addEventListener("change", (event) => {
      state.single.aircraft = event.target.value;
      renderSingleOutputs();
    });

    elements.singleCommanderInput.addEventListener("input", (event) => {
      syncBoundedNumberInput(event.target, 0, MAX_WEIGHT);
      state.single.commander = event.target.value;
      renderSingleOutputs();
    });

    elements.singlePassengerInput.addEventListener("input", (event) => {
      syncBoundedNumberInput(event.target, 0, MAX_WEIGHT);
      state.single.passenger = event.target.value;
      renderSingleOutputs();
    });

    elements.singleBallastSelect.addEventListener("change", (event) => {
      state.single.ballastCount = event.target.value;
      renderSingleOutputs();
    });

    elements.passengerCountInput.addEventListener("input", (event) => {
      const target = event.target;
      target.value = target.value.replace(/[^\d]/g, "");
    });

    elements.passengerCountInput.addEventListener("change", commitPassengerCountInput);
    elements.passengerCountInput.addEventListener("blur", commitPassengerCountInput);
    elements.passengerCountInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      commitPassengerCountInput(event);
    });

    elements.multiAircraftToggle.addEventListener("change", (event) => {
      state.multi.allocationEnabled = event.target.checked;
      if (state.multi.allocationEnabled) {
        state.multi.allocationType = "all-available";
      }
      renderAircraftPicker();
      renderAircraftConfigSection();
      renderMultiSummary();
    });

    elements.passengerInputs.addEventListener("input", (event) => {
      const target = event.target;
      const row = target.closest("[data-passenger-index]");

      if (!row) {
        return;
      }

      const index = Number(row.dataset.passengerIndex);
      const passenger = state.multi.passengers[index];

      if (!passenger) {
        return;
      }

      if (target.dataset.field === "name") {
        passenger.name = target.value;
      }

      if (target.dataset.field === "weight") {
        syncBoundedNumberInput(target, 0, MAX_WEIGHT);
        passenger.weight = target.value;
      }

      renderMultiSummary();
    });

    elements.multiAircraftPickerList.addEventListener("change", handleAircraftPickerChange);
    elements.aircraftConfigList.addEventListener("input", handleAircraftConfigInteraction);
    elements.aircraftConfigList.addEventListener("change", handleAircraftConfigInteraction);
    elements.multiAllocationTypeOptions.addEventListener("change", handleAllocationTypeChange);
    elements.multiSummaryTable.addEventListener("change", handleMultiSummaryInteraction);
    elements.resetManualAllocationButton.addEventListener("click", resetManualAllocations);
    elements.saveSummaryButton.addEventListener("click", saveSummaryPdf);
    elements.resetMultiButton.addEventListener("click", resetMultiMode);
  }

  async function loadAircraftData() {
    showLoadState({
      eyebrow: "Loading aircraft data",
      title: "Preparing the ballast calculator",
      message: "Please wait while the aircraft data file is loaded.",
      canRetry: false
    });

    try {
      const aircraftData = await fetchAircraftData(`${LOCAL_AIRCRAFT_DATA_URL}?v=${Date.now()}`);
      state.aircraftData = aircraftData;
      seedSingleAircraftSelection();
      seedAircraftConfigs();
      renderSingleAircraftOptions();
      renderAircraftPicker();
      renderAircraftConfigSection();
      renderAll();
      hideLoadState();
      clearBanner();
      console.info(`Loaded ${aircraftData.length} aircraft from assets/aircraft_weights.csv.`);
    } catch (error) {
      showLoadState({
        eyebrow: "Aircraft data unavailable",
        title: "The calculator could not load the aircraft list",
        message: `${error.message} Please retry. If the error persists, check the deployed CSV file or network access.`,
        canRetry: true
      });
      setBanner("Aircraft data could not be loaded. Retry is required before calculations can run.", "danger");
    }
  }

  async function fetchAircraftData(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Aircraft data request failed with status ${response.status}.`);
    }

    const csvText = await response.text();
    const aircraftData = normaliseAircraftRows(parseCsv(csvText));

    if (!aircraftData.length) {
      throw new Error("No aircraft were found in the aircraft data source.");
    }

    return aircraftData;
  }

  function setMode(mode) {
    state.mode = mode;
    const singleActive = mode === "single";

    elements.modeSingleButton.classList.toggle("is-active", singleActive);
    elements.modeSingleButton.setAttribute("aria-selected", String(singleActive));
    elements.modeMultiButton.classList.toggle("is-active", !singleActive);
    elements.modeMultiButton.setAttribute("aria-selected", String(!singleActive));
    elements.singleModePanel.hidden = !singleActive;
    elements.multiModePanel.hidden = singleActive;
  }

  function renderAll() {
    renderSingleOutputs();
    renderPassengerInputs();
    renderAircraftPicker();
    renderAircraftConfigSection();
    renderMultiSummary();
  }

  function openAircraftSubmissionModal() {
    lastFocusedElement = document.activeElement;
    elements.aircraftSubmissionModal.hidden = false;
    elements.aircraftSubmissionModal.classList.add("is-active");
    document.body.classList.add("is-modal-open");
    elements.aircraftSubmissionCloseButton.focus();
    elements.tripettoStatus.hidden = false;
    elements.tripettoStatus.textContent = "Loading form...";

    ensureTripettoForm()
      .then(() => {
        elements.tripettoStatus.hidden = true;
      })
      .catch((error) => {
        elements.tripettoStatus.hidden = false;
        elements.tripettoStatus.textContent = `${error.message} Please try again later.`;
      });
  }

  function closeAircraftSubmissionModal() {
    elements.aircraftSubmissionModal.classList.remove("is-active");
    elements.aircraftSubmissionModal.hidden = true;
    document.body.classList.remove("is-modal-open");

    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function maybeShowHomeScreenPrompt() {
    if (!elements.homeScreenPrompt || !shouldShowHomeScreenPrompt()) {
      return;
    }

    elements.homeScreenPrompt.hidden = false;
    elements.homeScreenPrompt.classList.add("is-visible");
    markHomeScreenPromptSeen();
  }

  function queueHomeScreenPrompt() {
    global.setTimeout(maybeShowHomeScreenPrompt, 300);
  }

  function dismissHomeScreenPrompt() {
    if (!elements.homeScreenPrompt) {
      return;
    }

    elements.homeScreenPrompt.classList.remove("is-visible");
    elements.homeScreenPrompt.hidden = true;
  }

  function shouldShowHomeScreenPrompt() {
    return !hasSeenHomeScreenPrompt() && isMobileBrowserViewport() && !isStandaloneDisplayMode();
  }

  function hasSeenHomeScreenPrompt() {
    try {
      return global.localStorage.getItem(HOME_SCREEN_PROMPT_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function markHomeScreenPromptSeen() {
    try {
      global.localStorage.setItem(HOME_SCREEN_PROMPT_STORAGE_KEY, "true");
    } catch (error) {
      // Ignore storage failures so the app can continue to render normally.
    }
  }

  function isMobileBrowserViewport() {
    return global.matchMedia
      ? global.matchMedia(MOBILE_SCREEN_QUERY).matches
      : global.innerWidth <= 699;
  }

  function isStandaloneDisplayMode() {
    const displayModeStandalone = global.matchMedia
      ? global.matchMedia("(display-mode: standalone)").matches
      : false;
    const navigatorStandalone = Boolean(global.navigator && global.navigator.standalone);

    return displayModeStandalone || navigatorStandalone;
  }

  function handleAircraftSubmissionModalClick(event) {
    if (event.target === elements.aircraftSubmissionModal) {
      closeAircraftSubmissionModal();
    }
  }

  function handleDocumentKeydown(event) {
    if (event.key === "Escape" && elements.aircraftSubmissionModal.classList.contains("is-active")) {
      closeAircraftSubmissionModal();
    }
  }

  async function ensureTripettoForm() {
    if (!tripettoFormPromise) {
      tripettoFormPromise = loadTripettoAssets()
        .then(() => {
          if (!global.TripettoClassic || !global.TripettoStudio || typeof global.TripettoStudio.form !== "function") {
            throw new Error("The manual review form could not be loaded.");
          }

          global.TripettoStudio.form({
            runner: global.TripettoClassic,
            token: TRIPETTO_FORM_TOKEN,
            element: "tripetto-19a4onr"
          });
        })
        .catch((error) => {
          tripettoFormPromise = null;
          throw error;
        });
    }

    return tripettoFormPromise;
  }

  function loadTripettoAssets() {
    if (!tripettoAssetsPromise) {
      tripettoAssetsPromise = TRIPETTO_SCRIPT_URLS.reduce((promise, source) => {
        return promise.then(() => loadExternalScript(source));
      }, Promise.resolve()).catch((error) => {
        tripettoAssetsPromise = null;
        throw error;
      });
    }

    return tripettoAssetsPromise;
  }

  function loadExternalScript(source) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${source}"]`);

      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }

        existing.addEventListener("load", () => {
          existing.dataset.loaded = "true";
          resolve();
        }, { once: true });
        existing.addEventListener("error", () => reject(new Error("The manual review form could not be loaded.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", () => reject(new Error("The manual review form could not be loaded.")), { once: true });
      document.head.appendChild(script);
    });
  }

  function renderSingleAircraftOptions() {
    const optionsHtml = state.aircraftData
      .map((aircraft) => {
        const selected = aircraft.aircraft === state.single.aircraft ? " selected" : "";
        return `<option value="${escapeHtml(aircraft.aircraft)}"${selected}>${escapeHtml(aircraft.aircraft)}</option>`;
      })
      .join("");

    elements.singleAircraftSelect.innerHTML = optionsHtml;
    elements.singleBallastSelect.value = state.single.ballastCount;
    elements.singleCommanderInput.value = state.single.commander;
    elements.singlePassengerInput.value = state.single.passenger;
  }

  function renderSingleOutputs() {
    const model = calculateSingleModel(state.single, state.aircraftData);

    elements.singleCalculations.innerHTML = [
      renderMetric("Aircraft Commander (with para)", `${formatWeight(model.commander)} kg`, model.commander > OVERWEIGHT_LIMIT ? `Overweight for flight at ${formatWeight(model.commander)} kg.` : "", model.commander > OVERWEIGHT_LIMIT),
      renderMetric("Passenger (with para)", `${formatWeight(model.passenger)} kg`, model.passenger > OVERWEIGHT_LIMIT ? `Overweight for flight at ${formatWeight(model.passenger)} kg.` : "", model.passenger > OVERWEIGHT_LIMIT),
      renderMetric("Ballast weight", `${formatWeight(model.ballastMass)} kg`),
      renderMetric("Total Payload", `${formatWeight(model.payload)} kg`),
      renderMetric("Aircraft weight", model.aircraft ? `${formatWeight(model.aircraft.weight)} kg` : "N/A"),
      renderMetric("Aircraft All-Up-Mass", model.aircraft ? `${formatWeight(model.aum)} kg` : "N/A")
    ].join("");

    elements.singleOutput.innerHTML = [
      renderStatusItem("AUM limit", model.aumStatus.text, model.aumStatus.tone),
      renderStatusItem("Front seat", model.frontSeatStatus.text, model.frontSeatStatus.tone),
      renderStatusItem("Ballast", model.ballastStatus.text, model.ballastStatus.tone),
      renderStatusItem("Approach speed", `Approach speed ${model.approachSpeed}kts`, "info")
    ].join("");

    renderAlternativeAircraftTable(model.payload);
  }

  function renderAlternativeAircraftTable(payload) {
    if (!state.aircraftData.length) {
      elements.altAircraftTable.innerHTML = `<div class="empty-state">Aircraft data is not available.</div>`;
      return;
    }

    const rows = state.aircraftData
      .map((aircraft) => {
        const overweight = payload > aircraft.maxPayload;
        return `
          <tr>
            <td>${escapeHtml(aircraft.aircraft)}</td>
            <td>${formatWeight(aircraft.weight)} kg</td>
            <td>${formatWeight(aircraft.maxPayload)} kg</td>
            <td><span class="pill ${overweight ? "pill--alert" : "pill--ok"}">${overweight ? "TRUE" : "FALSE"}</span></td>
          </tr>
        `;
      })
      .join("");

    elements.altAircraftTable.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Tail No</th>
            <th>A/C Weight</th>
            <th>Max Payload</th>
            <th>Overweight?</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderPassengerInputs() {
    elements.passengerCountInput.value = String(state.multi.passengerCount);
    elements.passengerInputs.innerHTML = state.multi.passengers
      .map((passenger, index) => {
        return `
          <div class="passenger-row" data-passenger-index="${index}">
            <input
              type="text"
              data-field="name"
              value="${escapeAttribute(passenger.name)}"
              aria-label="Passenger ${index + 1} name"
            >
            <input
              type="number"
              min="0"
              max="110"
              step="1"
              inputmode="decimal"
              data-field="weight"
              value="${escapeAttribute(passenger.weight)}"
              aria-label="Passenger ${index + 1} weight with parachute"
            >
          </div>
        `;
      })
      .join("");
  }

  function renderAircraftConfigSection() {
    elements.multiAircraftToggle.checked = state.multi.allocationEnabled;
    elements.multiAircraftPickerField.hidden = !state.multi.allocationEnabled;
    elements.aircraftConfigCard.hidden = !state.multi.allocationEnabled;

    if (!state.multi.allocationEnabled) {
      return;
    }

    const selectedAircraft = getSelectedAircraftNames(state.multi);

    if (!selectedAircraft.length) {
      elements.aircraftConfigList.innerHTML = `<div class="empty-state">Select one or more aircraft above to configure them here.</div>`;
      return;
    }

    const cards = state.aircraftData
      .filter((aircraft) => selectedAircraft.includes(aircraft.aircraft))
      .map((aircraft) => {
        const config = state.multi.aircraftConfigs[aircraft.aircraft] || createAircraftConfig();
        const validation = getAircraftConfigValidation(config);
        const classes = [
          "aircraft-config-card",
          validation.valid ? "is-valid" : "is-invalid"
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <div class="${classes}" data-aircraft="${escapeAttribute(aircraft.aircraft)}">
            <div class="aircraft-config-card__top">
              <div>
                <p class="aircraft-config-card__name">${escapeHtml(aircraft.aircraft)}</p>
                <p class="aircraft-config-card__weight">Aircraft weight: ${formatWeight(aircraft.weight)} kg</p>
              </div>
            </div>
            <div class="aircraft-config-card__fields">
              <label class="field">
                <span>Aircraft Commander Name <em>(optional)</em></span>
                <input
                  type="text"
                  data-field="commanderName"
                  value="${escapeAttribute(config.commanderName)}"
                  placeholder="Enter name"
                >
              </label>
              <label class="field">
                <span>Aircraft Commander <u>(WITH parachute)</u></span>
                <input
                  type="number"
                  min="0"
                  max="110"
                  step="1"
                  inputmode="decimal"
                  data-field="commanderWeight"
                  value="${escapeAttribute(config.commanderWeight)}"
                  placeholder="0"
                >
              </label>
              <label class="field">
                <span>Ballast Weights</span>
                <select data-field="ballastCount" aria-label="${escapeAttribute(aircraft.aircraft)} ballast weights">
                  <option value="" ${config.ballastCount === "" ? "selected" : ""}>Select ballast</option>
                  ${BALLAST_OPTIONS.map((option) => {
                    const selected = config.ballastCount === option.value ? "selected" : "";
                    return `<option value="${option.value}" ${selected}>${option.label}</option>`;
                  }).join("")}
                </select>
              </label>
            </div>
            <p class="validation-note ${validation.className}">${escapeHtml(validation.message)}</p>
          </div>
        `;
      })
      .join("");

    elements.aircraftConfigList.innerHTML = cards;
  }

  function renderAircraftPicker() {
    elements.multiAircraftToggle.checked = state.multi.allocationEnabled;
    elements.multiAircraftPickerField.hidden = !state.multi.allocationEnabled;

    if (!state.multi.allocationEnabled) {
      elements.multiAircraftSelectionCount.textContent = "0 aircraft selected";
      elements.multiAircraftPickerList.innerHTML = "";
      return;
    }

    const selectedAircraft = getSelectedAircraftNames(state.multi);
    elements.multiAircraftPickerList.innerHTML = state.aircraftData
      .map((aircraft) => {
        const checked = selectedAircraft.includes(aircraft.aircraft) ? "checked" : "";

        return `
          <label class="aircraft-picker__option">
            <input
              type="checkbox"
              value="${escapeAttribute(aircraft.aircraft)}"
              ${checked}
            >
            <span class="aircraft-picker__name">${escapeHtml(aircraft.aircraft)}</span>
            <span class="aircraft-picker__meta">${formatWeight(aircraft.weight)} kg</span>
          </label>
        `;
      })
      .join("");

    elements.multiAircraftSelectionCount.textContent = `${selectedAircraft.length} aircraft selected`;
  }

  function renderMultiSummary() {
    const summary = buildMultiSummaryTableModel(state.multi, state.aircraftData);
    renderMultiAllocationPanel(summary);

    if (!summary.rows.length) {
      elements.multiSummaryTable.innerHTML = `<div class="empty-state">No passenger data to show.</div>`;
      return;
    }

    const headerHtml = summary.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const rowHtml = summary.rows
      .map((row) => {
        const cells = summary.columns
          .map((column) => {
            if (column.html) {
              return `<td>${row[column.key]}</td>`;
            }

            return `<td>${escapeHtml(row[column.key])}</td>`;
          })
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    elements.multiSummaryTable.innerHTML = `
      <table class="data-table ${summary.tableClassName}">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    `;
  }

  function renderMultiAllocationPanel(summary) {
    const showPanel = state.multi.allocationEnabled;
    elements.multiAllocationPanel.hidden = !showPanel;

    if (!showPanel) {
      elements.multiAllocationTypeOptions.innerHTML = "";
      elements.multiAllocationStats.innerHTML = "";
      elements.multiAllocationStats.hidden = true;
      elements.manualAllocationActions.hidden = true;
      return;
    }

    elements.multiAllocationTypeOptions.innerHTML = ALLOCATION_TYPES.map((option) => {
      const checked = summary.allocationType === option.value ? "checked" : "";

      return `
        <label class="allocation-type-option">
          <input
            type="radio"
            name="multiAllocationType"
            value="${escapeAttribute(option.value)}"
            ${checked}
          >
          <span class="allocation-type-option__content">
            <span class="allocation-type-option__title">${escapeHtml(option.label)}</span>
            <span class="allocation-type-option__note">${escapeHtml(option.description)}</span>
          </span>
        </label>
      `;
    }).join("");

    elements.multiAllocationStats.hidden = !summary.showPassengerCounts;
    if (summary.showPassengerCounts) {
      elements.multiAllocationStats.innerHTML = `
        <div class="allocation-stats__header">
          <span>Passenger Count</span>
        </div>
        <div class="allocation-stats__grid">
          ${summary.passengerCounts.map((item) => {
            const className = item.key === "unallocated" ? "allocation-stat allocation-stat--unallocated" : "allocation-stat";
            return `
              <div class="${className}">
                <span class="allocation-stat__label">${escapeHtml(item.label)}</span>
                <span class="allocation-stat__value">${escapeHtml(String(item.count))}</span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } else {
      elements.multiAllocationStats.innerHTML = "";
    }

    elements.manualAllocationActions.hidden = summary.allocationType !== "manual-allocation";
  }

  function handleAllocationTypeChange(event) {
    const target = event.target;

    if (target.name !== "multiAllocationType") {
      return;
    }

    state.multi.allocationType = target.value;
    renderMultiSummary();
  }

  function handleMultiSummaryInteraction(event) {
    const target = event.target;

    if (target.dataset.field !== "manualAllocation") {
      return;
    }

    const index = Number(target.dataset.passengerIndex);
    const passenger = state.multi.passengers[index];

    if (!passenger) {
      return;
    }

    if (target.checked) {
      passenger.manualAllocation = target.value;
    } else if (passenger.manualAllocation === target.value) {
      passenger.manualAllocation = "";
    }

    renderMultiSummary();
  }

  function resetManualAllocations() {
    state.multi.passengers.forEach((passenger) => {
      passenger.manualAllocation = "";
    });
    renderMultiSummary();
  }

  function handleAircraftConfigInteraction(event) {
    const target = event.target;
    const card = target.closest("[data-aircraft]");

    if (!card) {
      return;
    }

    const aircraft = card.dataset.aircraft;
    const config = state.multi.aircraftConfigs[aircraft];

    if (!config) {
      return;
    }

    if (target.dataset.field === "commanderName") {
      config.commanderName = target.value;
    }

    if (target.dataset.field === "commanderWeight") {
      syncBoundedNumberInput(target, 0, MAX_WEIGHT);
      config.commanderWeight = target.value;
    }

    if (target.dataset.field === "ballastCount") {
      config.ballastCount = target.value;
    }

    refreshAircraftConfigCard(card, aircraft);
    renderMultiSummary();
  }

  function handleAircraftPickerChange() {
    state.multi.selectedAircraft = Array.from(
      elements.multiAircraftPickerList.querySelectorAll("input[type='checkbox']:checked")
    ).map((input) => input.value);

    renderAircraftPicker();
    renderAircraftConfigSection();
    renderMultiSummary();
  }

  function resetMultiMode() {
    state.multi.passengerCount = DEFAULT_PASSENGER_COUNT;
    state.multi.passengers = buildPassengerList(DEFAULT_PASSENGER_COUNT);
    state.multi.allocationEnabled = false;
    state.multi.allocationType = "all-available";
    state.multi.selectedAircraft = [];
    seedAircraftConfigs(true);
    renderPassengerInputs();
    renderAircraftPicker();
    renderAircraftConfigSection();
    renderMultiSummary();
  }

  function updatePassengerCount(nextCount) {
    const boundedCount = Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.round(nextCount)));

    state.multi.passengerCount = boundedCount;
    state.multi.passengers = resizePassengerList(state.multi.passengers, state.multi.passengerCount);
    renderPassengerInputs();
    renderMultiSummary();
  }

  function commitPassengerCountInput(event) {
    const target = event.target;

    if (target.value === "") {
      target.value = String(state.multi.passengerCount);
      return;
    }

    syncIntegerInput(target, MIN_PASSENGERS, MAX_PASSENGERS);
    updatePassengerCount(parseInteger(target.value, state.multi.passengerCount));
  }

  function saveSummaryPdf() {
    const jsPdfNamespace = global.jspdf;

    if (!jsPdfNamespace || typeof jsPdfNamespace.jsPDF !== "function") {
      setBanner("PDF export is not available because the local PDF library did not load.", "danger");
      return;
    }

    const summary = buildMultiSummaryTableModel(state.multi, state.aircraftData);
    const doc = new jsPdfNamespace.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4"
    });

    if (typeof doc.autoTable !== "function") {
      setBanner("PDF export is not available because the AutoTable plugin did not load.", "danger");
      return;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Passenger Ballast Summary - ${formatPdfDate(new Date())}`, 14, 16);

    let startY = 24;

    if (state.multi.allocationEnabled) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Allocation type: ${summary.allocationTypeLabel}`, 14, startY);
      startY += 6;
    }

    if (summary.validConfigs.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Aircraft settings used for allocation", 14, startY);
      startY += 4;
      doc.autoTable({
        startY,
        head: [["Tail No", "Aircraft Commander", "Aircraft Commander (kg)", "Ballast Weights"]],
        body: summary.validConfigs.map((config) => [
          config.aircraft,
          config.commanderName || "",
          formatWeight(config.commanderWeight),
          getBallastLabel(config.ballastCount)
        ]),
        theme: "grid",
        styles: {
          fontSize: 8,
          cellPadding: 2.2
        },
        headStyles: {
          fillColor: [15, 76, 92]
        },
        margin: { left: 14, right: 14 }
      });
      startY = doc.lastAutoTable.finalY + 8;
    }

    doc.autoTable({
      startY,
      head: [summary.columns.map((column) => column.label)],
      body: summary.rows.map((row) => summary.columns.map((column) => row[column.pdfKey || column.key])),
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        overflow: "linebreak",
        valign: "top"
      },
      headStyles: {
        fillColor: [15, 76, 92]
      },
      margin: { left: 14, right: 14 },
      columnStyles: summary.showAllocationColumn
        ? {
            5: { cellWidth: 80 }
          }
        : {}
    });

    if (summary.includeAllocationPage) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`Aircraft Allocation - ${summary.allocationTypeLabel}`, 14, 16);

      let allocationStartY = 24;
      summary.allocationSections.forEach((section) => {
        if (allocationStartY > 180) {
          doc.addPage();
          allocationStartY = 16;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(buildAllocationSectionHeading(section), 14, allocationStartY);
        allocationStartY += 4;

        doc.autoTable({
          startY: allocationStartY,
          head: [["Passenger", "Required Ballast", "Permitted Ballast", "Notes"]],
          body: section.rows.length
            ? section.rows.map((row) => [
                row.passenger,
                row.requiredBallast,
                row.permittedBallast,
                row.notes
              ])
            : [[section.key === "unallocated" ? "No unallocated passengers" : "No passengers allocated", "", "", ""]],
          theme: "grid",
          styles: {
            fontSize: 8,
            cellPadding: 2.2,
            overflow: "linebreak",
            valign: "top"
          },
          headStyles: {
            fillColor: [15, 76, 92]
          },
          margin: { left: 14, right: 14 },
          columnStyles: {
            3: { cellWidth: 150 }
          }
        });

        allocationStartY = doc.lastAutoTable.finalY + 8;
      });
    }

    doc.save(`ballast_summary_${formatIsoDate(new Date())}.pdf`);
  }

  function buildMultiSummaryTableModel(multiState, aircraftData) {
    const allocationEnabled = Boolean(multiState.allocationEnabled);
    const allocationType = allocationEnabled
      ? multiState.allocationType || "all-available"
      : "all-available";
    const allocationTypeLabel = getAllocationTypeLabel(allocationType);
    const selectedAircraftNames = allocationEnabled ? getSelectedAircraftNames(multiState) : [];
    const validConfigs = allocationEnabled
      ? getValidAircraftConfigs(aircraftData, multiState.aircraftConfigs, multiState.selectedAircraft)
      : [];
    const showAllocationColumn = allocationEnabled && selectedAircraftNames.length > 0;
    const columns = [
      { key: "passenger", label: "Passenger" },
      { key: "weight", label: "Weight with Para (KG)" },
      { key: "requiredBallast", label: "Required Ballast" },
      { key: "permittedBallast", label: "Permitted Ballast" },
      { key: "notes", label: "Notes" }
    ];
    const passengerModels = multiState.passengers.map((passenger, index) => {
      const name = passenger.name.trim() || `Pax${index + 1}`;
      const weightValue = getNumericValue(passenger.weight);
      const ballastSummary = buildBallastSummary(weightValue);
      const allocationOptions = allocationEnabled
        ? buildPassengerAllocationOptions(ballastSummary, weightValue, validConfigs)
        : buildPassengerAllocationOptions(ballastSummary, weightValue, []);
      const manualAllocation = passenger.manualAllocation || "";
      const manualAllocationIsValid = manualAllocation !== ""
        && allocationOptions.eligibleAircraftNames.includes(manualAllocation);

      return {
        index,
        name,
        weight: passenger.weight === "" ? "" : formatWeight(weightValue),
        weightValue,
        requiredBallast: ballastSummary.required,
        permittedBallast: ballastSummary.permitted,
        notes: ballastSummary.status,
        ballastSummary,
        allocationOptions,
        manualAllocation,
        manualAllocationIsValid
      };
    });
    const autoAssignments = allocationType === "auto-allocate"
      ? autoAllocatePassengers(passengerModels, selectedAircraftNames)
      : {};
    const assignmentByPassenger = {};
    const rows = passengerModels.map((passengerModel) => {
      const row = {
        passenger: passengerModel.name,
        weight: passengerModel.weight,
        requiredBallast: passengerModel.requiredBallast,
        permittedBallast: passengerModel.permittedBallast,
        notes: passengerModel.notes
      };

      if (!showAllocationColumn) {
        return row;
      }

      if (allocationType === "all-available") {
        const allocationDisplay = resolveAircraftAllocation(
          passengerModel.ballastSummary,
          passengerModel.weightValue,
          validConfigs
        );
        row.aircraftAllocationDisplay = allocationDisplay;
        row.aircraftAllocationText = allocationDisplay;
        return row;
      }

      if (allocationType === "auto-allocate") {
        const assignedAircraft = autoAssignments[passengerModel.index] || "";
        assignmentByPassenger[passengerModel.index] = assignedAircraft;
        row.aircraftAllocationDisplay = assignedAircraft || "Not Allocated";
        row.aircraftAllocationText = row.aircraftAllocationDisplay;
        return row;
      }

      const assignedAircraft = passengerModel.manualAllocationIsValid
        ? passengerModel.manualAllocation
        : "";
      assignmentByPassenger[passengerModel.index] = assignedAircraft;
      row.aircraftAllocationDisplay = buildManualAllocationCell(passengerModel);
      row.aircraftAllocationText = assignedAircraft || "Not Allocated";
      return row;
    });

    if (showAllocationColumn) {
      columns.push({
        key: "aircraftAllocationDisplay",
        pdfKey: "aircraftAllocationText",
        label: getAllocationColumnLabel(allocationType),
        html: allocationType === "manual-allocation"
      });
    }

    const showPassengerCounts = allocationEnabled && allocationType !== "all-available";
    const passengerCounts = showPassengerCounts
      ? buildAllocationCounts(selectedAircraftNames, passengerModels, assignmentByPassenger)
      : [];
    const allocationSections = showPassengerCounts
      ? buildAllocationSections(
          selectedAircraftNames,
          multiState.aircraftConfigs,
          passengerModels,
          assignmentByPassenger,
          allocationType
        )
      : [];

    return {
      allocationType,
      allocationTypeLabel,
      columns,
      rows,
      showAllocationColumn,
      showPassengerCounts,
      passengerCounts,
      validConfigs,
      includeAllocationPage: showPassengerCounts,
      allocationSections,
      tableClassName: allocationType === "manual-allocation" && showAllocationColumn
        ? "data-table--manual-allocation"
        : ""
    };
  }

  function getAllocationTypeLabel(allocationType) {
    const option = ALLOCATION_TYPES.find((item) => item.value === allocationType);
    return option ? option.label : "All Available";
  }

  function getAllocationColumnLabel(allocationType) {
    if (allocationType === "manual-allocation") {
      return "Manual Allocation";
    }

    if (allocationType === "auto-allocate") {
      return "Aircraft Allocation";
    }

    return "Available Aircraft";
  }

  function buildPassengerAllocationOptions(summary, passengerWeight, validConfigs) {
    if (summary.code === "rear-only") {
      return {
        eligibleConfigs: [],
        eligibleAircraftNames: [],
        status: "rear-only",
        reason: "Rear seat only",
        displayText: "Rear seat only"
      };
    }

    if (summary.code === "no-weight" || summary.code === "too-light" || summary.code === "too-heavy") {
      return {
        eligibleConfigs: [],
        eligibleAircraftNames: [],
        status: "not-allocatable",
        reason: summary.status,
        displayText: "Not Allocatable"
      };
    }

    const eligibleConfigs = validConfigs.filter((config) => {
      const ballastAllowed = summary.allowedBallastCounts.includes(config.ballastCount);
      const withinMassLimit = config.weight + config.commanderWeight + passengerWeight + config.ballastMass <= MAX_AUM;
      return ballastAllowed && withinMassLimit;
    });

    if (!eligibleConfigs.length) {
      return {
        eligibleConfigs: [],
        eligibleAircraftNames: [],
        status: "no-eligible-aircraft",
        reason: "No eligible aircraft",
        displayText: "No eligible aircraft"
      };
    }

    return {
      eligibleConfigs,
      eligibleAircraftNames: eligibleConfigs.map((config) => config.aircraft),
      status: "eligible",
      reason: "",
      displayText: eligibleConfigs.map((config) => config.aircraft).join(", ")
    };
  }

  function autoAllocatePassengers(passengerModels, selectedAircraftNames) {
    const aircraftOrder = new Map(
      selectedAircraftNames.map((aircraft, index) => [aircraft, index])
    );
    const counts = Object.fromEntries(selectedAircraftNames.map((aircraft) => [aircraft, 0]));
    const assignments = {};
    const allocationQueue = passengerModels
      .filter((passenger) => passenger.allocationOptions.eligibleAircraftNames.length > 0)
      .slice()
      .sort((left, right) => {
        return left.allocationOptions.eligibleAircraftNames.length - right.allocationOptions.eligibleAircraftNames.length
          || left.index - right.index;
      });

    allocationQueue.forEach((passenger) => {
      const bestAircraft = passenger.allocationOptions.eligibleAircraftNames
        .slice()
        .sort((left, right) => {
          return counts[left] - counts[right]
            || (aircraftOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (aircraftOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
        })[0];

      if (!bestAircraft) {
        return;
      }

      assignments[passenger.index] = bestAircraft;
      counts[bestAircraft] += 1;
    });

    return assignments;
  }

  function buildManualAllocationCell(passengerModel) {
    const options = [];

    if (passengerModel.manualAllocation && !passengerModel.manualAllocationIsValid) {
      options.push(`
        <label class="manual-allocation-option manual-allocation-option--invalid">
          <input
            type="checkbox"
            data-field="manualAllocation"
            data-passenger-index="${passengerModel.index}"
            value="${escapeAttribute(passengerModel.manualAllocation)}"
            checked
          >
          <span class="manual-allocation-option__content">
            <span class="manual-allocation-option__title">
              <span class="allocation-error-chip">
                <span class="allocation-error-icon" aria-hidden="true">!</span>
                <span>${escapeHtml(passengerModel.manualAllocation)}</span>
              </span>
            </span>
            <span class="manual-allocation-option__meta">
              Invalid assignment. This passenger is treated as unallocated.
            </span>
          </span>
        </label>
      `);
    }

    passengerModel.allocationOptions.eligibleAircraftNames.forEach((aircraft) => {
      const checked = passengerModel.manualAllocationIsValid && passengerModel.manualAllocation === aircraft;
      const className = checked
        ? "manual-allocation-option manual-allocation-option--assigned"
        : "manual-allocation-option";

      options.push(`
        <label class="${className}">
          <input
            type="checkbox"
            data-field="manualAllocation"
            data-passenger-index="${passengerModel.index}"
            value="${escapeAttribute(aircraft)}"
            ${checked ? "checked" : ""}
          >
          <span class="manual-allocation-option__content">
            <span class="manual-allocation-option__title">${escapeHtml(aircraft)}</span>
            <span class="manual-allocation-option__meta">
              ${checked ? "Assigned aircraft" : "Select this aircraft"}
            </span>
          </span>
        </label>
      `);
    });

    if (!options.length) {
      return `
        <div class="manual-allocation-cell">
          <span class="manual-allocation-note">${escapeHtml(passengerModel.allocationOptions.reason || "No eligible aircraft")}</span>
        </div>
      `;
    }

    const detailNote = passengerModel.manualAllocation && !passengerModel.manualAllocationIsValid
      ? `<span class="manual-allocation-note manual-allocation-note--danger">${escapeHtml(passengerModel.allocationOptions.reason || "No eligible aircraft")}</span>`
      : "";

    return `
      <div class="manual-allocation-cell">
        ${options.join("")}
        ${detailNote}
      </div>
    `;
  }

  function buildAllocationCounts(selectedAircraftNames, passengerModels, assignmentByPassenger) {
    const counts = Object.fromEntries(selectedAircraftNames.map((aircraft) => [aircraft, 0]));
    let unallocatedCount = 0;

    passengerModels.forEach((passenger) => {
      const assignedAircraft = assignmentByPassenger[passenger.index];

      if (assignedAircraft && Object.prototype.hasOwnProperty.call(counts, assignedAircraft)) {
        counts[assignedAircraft] += 1;
      } else {
        unallocatedCount += 1;
      }
    });

    return selectedAircraftNames
      .map((aircraft) => ({
        key: aircraft,
        label: aircraft,
        count: counts[aircraft]
      }))
      .concat({
        key: "unallocated",
        label: "Unallocated",
        count: unallocatedCount
      });
  }

  function buildAllocationSections(selectedAircraftNames, configsByAircraft, passengerModels, assignmentByPassenger, allocationType) {
    const rowsByAircraft = Object.fromEntries(selectedAircraftNames.map((aircraft) => [aircraft, []]));
    const unallocatedRows = [];

    passengerModels.forEach((passenger) => {
      const row = {
        passenger: passenger.name,
        requiredBallast: passenger.requiredBallast,
        permittedBallast: passenger.permittedBallast,
        notes: buildAllocationSectionNotes(passenger, assignmentByPassenger[passenger.index], allocationType)
      };
      const assignedAircraft = assignmentByPassenger[passenger.index];

      if (assignedAircraft && Object.prototype.hasOwnProperty.call(rowsByAircraft, assignedAircraft)) {
        rowsByAircraft[assignedAircraft].push(row);
      } else {
        unallocatedRows.push(row);
      }
    });

    return selectedAircraftNames
      .map((aircraft) => {
        const config = configsByAircraft[aircraft] || createAircraftConfig();

        return {
          key: aircraft,
          label: aircraft,
          commanderName: (config.commanderName || "").trim(),
          ballastLabel: getPdfBallastLabel(config.ballastCount),
          rows: rowsByAircraft[aircraft]
        };
      })
      .concat({
        key: "unallocated",
        label: "Unallocated",
        commanderName: "",
        ballastLabel: "",
        rows: unallocatedRows
      });
  }

  function buildAllocationSectionNotes(passengerModel, assignedAircraft, allocationType) {
    const notes = [passengerModel.notes];

    if (!assignedAircraft && passengerModel.allocationOptions.status === "no-eligible-aircraft") {
      notes.push("No eligible aircraft");
    }

    if (!assignedAircraft && allocationType === "manual-allocation") {
      if (passengerModel.manualAllocation && !passengerModel.manualAllocationIsValid) {
        notes.push(`Invalid manual allocation: ${passengerModel.manualAllocation}`);
      } else if (passengerModel.allocationOptions.eligibleAircraftNames.length > 0) {
        notes.push("No manual allocation selected");
      }
    }

    return notes.filter(Boolean).join(". ");
  }

  function buildAllocationSectionHeading(section) {
    if (section.key === "unallocated") {
      return `${section.label} (${section.rows.length} passengers)`;
    }

    const headingParts = [section.label];

    if (section.commanderName) {
      headingParts.push(section.commanderName);
    }

    if (section.ballastLabel) {
      headingParts.push(section.ballastLabel);
    }

    return `${headingParts.join(" - ")} (${section.rows.length} passengers)`;
  }

  function calculateSingleModel(singleState, aircraftData) {
    const commander = getNumericValue(singleState.commander);
    const passenger = getNumericValue(singleState.passenger);
    const ballastCount = singleState.ballastCount || "0";
    const ballastMass = getBallastMass(ballastCount);
    const payload = commander + passenger + ballastMass;
    const aircraft = aircraftData.find((item) => item.aircraft === singleState.aircraft) || aircraftData[0] || null;
    const aum = aircraft ? aircraft.weight + payload : 0;

    return {
      commander,
      passenger,
      ballastCount,
      ballastMass,
      payload,
      aircraft,
      aum,
      aumStatus: getSingleAumStatus(aum),
      frontSeatStatus: getFrontSeatStatus(passenger),
      ballastStatus: getSingleBallastStatus(passenger, ballastCount),
      approachSpeed: getApproachSpeed(aum)
    };
  }

  function getSingleAumStatus(aum) {
    if (aum <= MAX_AUM) {
      return {
        tone: "success",
        text: "Aircraft All-Up-Mass Limits OK"
      };
    }

    return {
      tone: "danger",
      text: "Aircraft All-Up-Mass Limits EXCEEDED"
    };
  }

  function getFrontSeatStatus(passengerWeight) {
    if (passengerWeight < FRONT_SEAT_MIN_WEIGHT) {
      return {
        tone: "danger",
        text: "Front seat minimum weight NOT met"
      };
    }

    return {
      tone: "success",
      text: "Front seat minimum weight OK"
    };
  }

  function getSingleBallastStatus(passengerWeight, ballastCount) {
    const rule = getPassengerBallastRule(passengerWeight);
    const baseStatus = rule ? { ...rule.single } : { ...PASSENGER_BALLAST_RULES[0].single };

    if (!Number.isFinite(passengerWeight) || passengerWeight <= 0) {
      return baseStatus;
    }

    const summary = buildBallastSummary(passengerWeight);
    const selectedBallastCount = Number(ballastCount || 0);

    if (summary.allowedBallastCounts.length && !summary.allowedBallastCounts.includes(selectedBallastCount)) {
      return {
        tone: "danger",
        text: getInvalidSingleBallastMessage(summary)
      };
    }

    return baseStatus;
  }

  function buildBallastSummary(weight) {
    if (!Number.isFinite(weight) || weight <= 0) {
      return {
        required: "",
        permitted: "",
        status: "No weight entered",
        code: "no-weight",
        allowedBallastCounts: []
      };
    }

    const rule = getPassengerBallastRule(weight);
    return rule ? { ...rule.summary } : { ...PASSENGER_BALLAST_RULES[PASSENGER_BALLAST_RULES.length - 1].summary };
  }

  function getPassengerBallastRule(weight) {
    if (!Number.isFinite(weight) || weight < 0) {
      return null;
    }

    if (weight > OVERWEIGHT_LIMIT) {
      return PASSENGER_BALLAST_RULES[PASSENGER_BALLAST_RULES.length - 1];
    }

    return PASSENGER_BALLAST_RULES.find((rule) => weight >= rule.min && weight < rule.max) || null;
  }

  function getInvalidSingleBallastMessage(summary) {
    if (summary.code === "must-use-two") {
      return "Selected ballast setting invalid. TWO ballast weights MUST be fitted";
    }

    if (summary.code === "must-use-one-or-two") {
      return "Selected ballast setting invalid. At least ONE ballast weight MUST be fitted";
    }

    if (summary.code === "ballast-optional-zero-or-one") {
      return "Selected ballast setting invalid. Only 0 or 1 ballast weight may be fitted";
    }

    if (summary.code === "ballast-not-permitted") {
      return "Selected ballast setting invalid. Ballast weights are NOT PERMITTED";
    }

    return "Selected ballast setting invalid for this passenger weight";
  }

  function buildAuditReference() {
    return {
      constants: {
        maxAum: MAX_AUM,
        seatMaximumWeight: MAX_WEIGHT,
        commanderAllocationLimit: OVERWEIGHT_LIMIT,
        frontSeatMinimumWeight: FRONT_SEAT_MIN_WEIGHT,
        approachSpeedThreshold: APPROACH_SPEED_THRESHOLD,
        approachSpeedBelowThreshold: APPROACH_SPEEDS.belowThreshold,
        approachSpeedAtOrAboveThreshold: APPROACH_SPEEDS.thresholdOrAbove
      },
      ballastOptions: BALLAST_OPTIONS.map((option) => ({
        label: option.label,
        countLabel: getPdfBallastLabel(option.value),
        countValue: Number(option.value),
        mass: option.mass
      })),
      ballastRules: PASSENGER_BALLAST_RULES.map((rule) => ({
        rangeLabel: rule.auditLabel,
        required: rule.summary.required,
        permitted: rule.summary.permitted,
        summaryStatus: rule.summary.status,
        singleStatus: rule.single.text,
        allowedBallastCounts: rule.summary.allowedBallastCounts.slice()
      })),
      formulas: {
        payload: "Payload = Aircraft Commander weight + Passenger weight + Ballast mass",
        aum: "Aircraft All-Up Mass = Aircraft empty weight + Payload",
        allocationAum: "Allocation check uses aircraft weight + commander weight + passenger weight + configured ballast mass",
        allocationRule: "A passenger can only be allocated if the aircraft ballast setting is permitted for that passenger and the resulting all-up mass does not exceed the maximum allowed."
      }
    };
  }

  function getValidAircraftConfigs(aircraftData, configsByAircraft, selectedAircraftNames) {
    const aircraftByName = new Map(aircraftData.map((aircraft) => [aircraft.aircraft, aircraft]));

    return (selectedAircraftNames || [])
      .map((aircraftName) => {
        const aircraft = aircraftByName.get(aircraftName);

        if (!aircraft) {
          return null;
        }

        const config = configsByAircraft[aircraftName];
        const validation = getAircraftConfigValidation(config);

        if (!config || !validation.valid) {
          return null;
        }

        return {
          aircraft: aircraft.aircraft,
          weight: aircraft.weight,
          commanderName: (config.commanderName || "").trim(),
          commanderWeight: getNumericValue(config.commanderWeight),
          ballastCount: Number(config.ballastCount),
          ballastMass: getBallastMass(config.ballastCount)
        };
      })
      .filter(Boolean);
  }

  function resolveAircraftAllocation(summary, passengerWeight, validConfigs) {
    const options = buildPassengerAllocationOptions(summary, passengerWeight, validConfigs);
    return options.displayText;
  }

  function getAircraftConfigValidation(config) {
    if (!config) {
      return {
        valid: false,
        message: "Select this aircraft above to configure it.",
        className: "validation-note--warning"
      };
    }

    const commanderWeight = getNumericValue(config.commanderWeight);
    const hasCommanderWeight = config.commanderWeight !== "";
    const hasBallastCount = config.ballastCount !== "";

    if (!hasCommanderWeight || commanderWeight <= 0) {
      return {
        valid: false,
        message: "Enter Aircraft Commander weight above 0 kg.",
        className: "validation-note--warning"
      };
    }

    if (commanderWeight > OVERWEIGHT_LIMIT) {
      return {
        valid: false,
        message: "Aircraft Commander exceeds 110 kg and cannot be allocated.",
        className: "validation-note--warning"
      };
    }

    if (!hasBallastCount) {
      return {
        valid: false,
        message: "Choose a ballast setting before allocation can use this aircraft.",
        className: "validation-note--warning"
      };
    }

    return {
      valid: true,
      message: "This aircraft is valid for allocation.",
      className: "validation-note--success"
    };
  }

  function refreshAircraftConfigCard(card, aircraftName) {
    const config = state.multi.aircraftConfigs[aircraftName];

    if (!config) {
      return;
    }

    const validation = getAircraftConfigValidation(config);
    card.classList.toggle("is-valid", validation.valid);
    card.classList.toggle("is-invalid", !validation.valid);

    const validationNote = card.querySelector(".validation-note");
    if (validationNote) {
      validationNote.className = `validation-note ${validation.className}`.trim();
      validationNote.textContent = validation.message;
    }
  }

  function buildPassengerList(count) {
    return Array.from({ length: count }, (_, index) => ({
      name: `Pax${index + 1}`,
      weight: "0",
      manualAllocation: ""
    }));
  }

  function resizePassengerList(existing, count) {
    const resized = [];

    for (let index = 0; index < count; index += 1) {
      if (existing[index]) {
        resized.push({
          ...existing[index],
          manualAllocation: existing[index].manualAllocation || ""
        });
      } else {
        resized.push({
          name: `Pax${index + 1}`,
          weight: "0",
          manualAllocation: ""
        });
      }
    }

    return resized;
  }

  function seedSingleAircraftSelection() {
    if (!state.aircraftData.length) {
      state.single.aircraft = "";
      return;
    }

    const existing = state.aircraftData.find((aircraft) => aircraft.aircraft === state.single.aircraft);
    state.single.aircraft = existing ? existing.aircraft : state.aircraftData[0].aircraft;
  }

  function seedAircraftConfigs(reset) {
    const nextConfigs = {};

    state.aircraftData.forEach((aircraft) => {
      const previous = reset ? null : state.multi.aircraftConfigs[aircraft.aircraft];
      nextConfigs[aircraft.aircraft] = previous
        ? { ...previous }
        : createAircraftConfig();
    });

    state.multi.aircraftConfigs = nextConfigs;
  }

  function createAircraftConfig() {
    return {
      commanderName: "",
      commanderWeight: "",
      ballastCount: ""
    };
  }

  function getSelectedAircraftNames(multiState) {
    return Array.isArray(multiState.selectedAircraft) ? multiState.selectedAircraft : [];
  }

  function showLoadState({ eyebrow, title, message, canRetry }) {
    elements.loadEyebrow.textContent = eyebrow;
    elements.loadTitle.textContent = title;
    elements.loadMessage.textContent = message;
    elements.retryLoadButton.hidden = !canRetry;
    elements.loadOverlay.classList.add("is-active");
  }

  function hideLoadState() {
    elements.loadOverlay.classList.remove("is-active");
  }

  function setBanner(message, tone) {
    elements.statusBanner.className = `status-banner status-banner--${tone}`;
    elements.statusBanner.textContent = message;
  }

  function clearBanner() {
    elements.statusBanner.className = "status-banner is-hidden";
    elements.statusBanner.textContent = "";
  }

  function renderMetric(label, value, note, danger) {
    const className = danger ? "metric metric--danger" : "metric";
    return `
      <div class="${className}">
        <span class="metric__label">${escapeHtml(label)}</span>
        <span class="metric__value">${escapeHtml(value)}</span>
        ${note ? `<span class="metric__note">${escapeHtml(note)}</span>` : ""}
      </div>
    `;
  }

  function renderStatusItem(title, text, tone) {
    return `
      <div class="status-item status-item--${tone}">
        <span class="status-item__dot" aria-hidden="true"></span>
        <div class="status-item__content">
          <span class="status-item__title">${escapeHtml(title)}</span>
          <span class="status-item__text">${escapeHtml(text)}</span>
        </div>
      </div>
    `;
  }

  function syncBoundedNumberInput(input, min, max) {
    if (input.value === "") {
      return;
    }

    const number = Number(input.value);

    if (!Number.isFinite(number)) {
      input.value = "";
      return;
    }

    const bounded = Math.min(max, Math.max(min, number));
    input.value = Number.isInteger(bounded) ? String(bounded) : String(Number(bounded.toFixed(2)));
  }

  function syncIntegerInput(input, min, max) {
    if (input.value === "") {
      input.value = String(min);
      return;
    }

    const number = Number(input.value);

    if (!Number.isFinite(number)) {
      input.value = String(min);
      return;
    }

    const bounded = Math.min(max, Math.max(min, Math.round(number)));
    input.value = String(bounded);
  }

  function getNumericValue(value) {
    if (value === "" || value === null || value === undefined) {
      return 0;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function parseInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  function getBallastMass(ballastCount) {
    const option = BALLAST_OPTIONS.find((item) => item.value === String(ballastCount));
    return option ? option.mass : 0;
  }

  function getBallastLabel(ballastCount) {
    const option = BALLAST_OPTIONS.find((item) => item.value === String(ballastCount));
    return option ? option.label : "";
  }

  function getPdfBallastLabel(ballastCount) {
    if (String(ballastCount) === "0") {
      return "No ballast weights";
    }

    if (String(ballastCount) === "1") {
      return "One ballast weight";
    }

    if (String(ballastCount) === "2") {
      return "Two ballast weights";
    }

    return "Ballast not set";
  }

  function getApproachSpeed(aum) {
    return aum < APPROACH_SPEED_THRESHOLD
      ? APPROACH_SPEEDS.belowThreshold
      : APPROACH_SPEEDS.thresholdOrAbove;
  }

  function formatWeight(value) {
    if (!Number.isFinite(value)) {
      return "";
    }

    return Number(value.toFixed(2)).toString();
  }

  function formatPdfDate(date) {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function formatIsoDate(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let index = 0;
    let insideQuotes = false;

    while (index < text.length) {
      const char = text[index];
      const nextChar = text[index + 1];

      if (char === "\"") {
        if (insideQuotes && nextChar === "\"") {
          value += "\"";
          index += 2;
          continue;
        }

        insideQuotes = !insideQuotes;
        index += 1;
        continue;
      }

      if (char === "," && !insideQuotes) {
        row.push(value);
        value = "";
        index += 1;
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          index += 1;
        }

        row.push(value);
        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }
        row = [];
        value = "";
        index += 1;
        continue;
      }

      value += char;
      index += 1;
    }

    if (value !== "" || row.length) {
      row.push(value);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
    }

    if (!rows.length) {
      return [];
    }

    const headers = rows[0].map((header) => header.trim());

    return rows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, position) => {
        record[header] = (cells[position] || "").trim();
      });
      return record;
    });
  }

  function normaliseAircraftRows(rows) {
    return rows
      .map((row) => {
        const aircraft = (row.aircraft || "").trim();
        const weight = Number(row.weight);

        if (!aircraft || !Number.isFinite(weight)) {
          return null;
        }

        return {
          aircraft,
          weight,
          maxPayload: Number((MAX_AUM - weight).toFixed(2))
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.aircraft.localeCompare(right.aircraft, undefined, { numeric: true, sensitivity: "base" }));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})(typeof window !== "undefined" ? window : globalThis);
