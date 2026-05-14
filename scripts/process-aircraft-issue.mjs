import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  canonicaliseWeight,
  parseAndValidateIssueSubmission,
  parseCsv,
  parseIssueBody,
  stringifyCsv
} from "./lib/aircraft-submission.mjs";

export { parseIssueBody };

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
  csvPath = process.env.CSV_PATH || "assets/aircraft_weights.csv",
  issueBody = process.env.ISSUE_BODY || "",
  issueCreatedAt = process.env.ISSUE_CREATED_AT || new Date().toISOString()
} = {}) {
  const { aircraft, weight, location, submitterEmail } = parseAndValidateIssueSubmission(issueBody);

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const timestamp = new Date(issueCreatedAt).toISOString();
  const existingIndex = rows.findIndex((row) => row.aircraft.toUpperCase() === aircraft.toUpperCase());

  let changeAction = "added";

  if (existingIndex >= 0) {
    const existingWeight = String(Number(canonicaliseWeight(rows[existingIndex].weight).toFixed(4)));
    const existingLocation = String(rows[existingIndex].location || "").trim();
    const existingSubmitterEmail = String(rows[existingIndex].submitterEmail || "").trim().toLowerCase();

    if (existingWeight === weight && existingLocation === location && existingSubmitterEmail === submitterEmail) {
      changeAction = "no-change";
    } else {
      rows[existingIndex] = {
        Timestamp: timestamp,
        aircraft,
        weight,
        location,
        submitterEmail
      };
      changeAction = "updated";
    }
  } else {
    rows.push({
      Timestamp: timestamp,
      aircraft,
      weight,
      location,
      submitterEmail
    });
  }

  if (changeAction !== "no-change") {
    rows.sort((left, right) => left.aircraft.localeCompare(right.aircraft, undefined, {
      numeric: true,
      sensitivity: "base"
    }));
    fs.writeFileSync(csvPath, stringifyCsv(rows));
  }

  setOutput("aircraft", aircraft);
  setOutput("weight", weight);
  setOutput("location", location);
  setOutput("submitter_email", submitterEmail || "Not provided");
  setOutput("change_action", changeAction);

  return {
    aircraft,
    weight,
    location,
    submitterEmail,
    changeAction
  };
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
