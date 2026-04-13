import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  AIRCRAFT_CSV_PATH,
  AIRCRAFT_SUBMISSION_LABEL,
  extractClosedIssueNumber,
  extractIssueNumberFromAutomationBranch,
  indexRowsByAircraft,
  parseAndValidateIssueSubmission,
  parseCsv
} from "./lib/aircraft-submission.mjs";

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    setOutput("error_message", error.message);
    console.error(error.message);
    process.exit(1);
  }
}

export function main({
  contextPath = process.env.PR_CONTEXT_PATH || ".github/aircraft-pr-context.json",
  csvPath = process.env.CSV_PATH || AIRCRAFT_CSV_PATH
} = {}) {
  const context = loadContext(contextPath);
  const baseCsvText = typeof context.baseCsvContent === "string"
    ? context.baseCsvContent
    : fs.readFileSync(csvPath, "utf8");
  const result = validateAircraftPullRequest({
    ...context,
    baseCsvText,
    csvPath
  });

  setOutput("issue_number", result.issueNumber);
  setOutput("aircraft", result.aircraft);
  setOutput("weight", result.weight);
  setOutput("submitter_email", result.submitterEmail);

  return result;
}

export function validateAircraftPullRequest({
  issueBody = "",
  issueLabels = [],
  prBody = "",
  prHeadRef = "",
  changedFiles = [],
  baseCsvText = "",
  headCsvContent = "",
  csvPath = AIRCRAFT_CSV_PATH
} = {}) {
  const issueNumber = extractIssueNumberFromAutomationBranch(prHeadRef);

  if (!issueNumber) {
    throw new Error("Pull request branch must match `automation/add-aircraft-<issue-number>`.");
  }

  const closedIssueNumber = extractClosedIssueNumber(prBody);

  if (closedIssueNumber !== issueNumber) {
    throw new Error(`Pull request body must close issue #${issueNumber}.`);
  }

  if (!Array.isArray(issueLabels) || !issueLabels.includes(AIRCRAFT_SUBMISSION_LABEL)) {
    throw new Error(`Linked issue #${issueNumber} must include the \`${AIRCRAFT_SUBMISSION_LABEL}\` label.`);
  }

  if (!Array.isArray(changedFiles) || changedFiles.length !== 1 || changedFiles[0] !== csvPath) {
    throw new Error(`Pull request must only change \`${csvPath}\`.`);
  }

  const { aircraft, weight, submitterEmail } = parseAndValidateIssueSubmission(issueBody);

  validateCsvChange({
    aircraft,
    baseCsvText,
    csvPath,
    headCsvText: headCsvContent,
    weight
  });

  return {
    issueNumber: String(issueNumber),
    aircraft,
    weight,
    submitterEmail
  };
}

function validateCsvChange({
  aircraft,
  baseCsvText,
  csvPath,
  headCsvText,
  weight
}) {
  const baseRows = parseCsv(baseCsvText);
  const headRows = parseCsv(headCsvText);
  const baseByAircraft = indexRowsByAircraft(baseRows, `Base ${csvPath}`);
  const headByAircraft = indexRowsByAircraft(headRows, `Pull request ${csvPath}`);
  const allAircraft = new Set([...baseByAircraft.keys(), ...headByAircraft.keys()]);
  const changedAircraft = [];

  allAircraft.forEach((tailNumber) => {
    if (!rowsEqual(baseByAircraft.get(tailNumber), headByAircraft.get(tailNumber))) {
      changedAircraft.push(tailNumber);
    }
  });

  if (changedAircraft.length !== 1 || changedAircraft[0] !== aircraft) {
    throw new Error(`Pull request must only add or update ${aircraft} in \`${csvPath}\`.`);
  }

  const updatedRow = headByAircraft.get(aircraft);

  if (!updatedRow) {
    throw new Error(`Pull request must include ${aircraft} in \`${csvPath}\`.`);
  }

  if (updatedRow.weight !== weight) {
    throw new Error(`Pull request row for ${aircraft} must set the weight to ${weight} kg.`);
  }
}

function rowsEqual(left, right) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.Timestamp === right.Timestamp && left.aircraft === right.aircraft && left.weight === right.weight;
}

function loadContext(contextPath) {
  try {
    return JSON.parse(fs.readFileSync(contextPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read pull request context from \`${contextPath}\`: ${error.message}`);
  }
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}=${String(value).replace(/\n/g, " ")}\n`);
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}
