import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseAndValidateIssueSubmission } from "./lib/aircraft-submission.mjs";
import { main as processAircraftIssue } from "./process-aircraft-issue.mjs";
import { validateAircraftPullRequest } from "./verify-aircraft-pr.mjs";

test("process-aircraft-issue adds a valid submission to the CSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ballast-aircraft-"));
  const csvPath = path.join(tempDir, "aircraft_weights.csv");

  fs.writeFileSync(
    csvPath,
    [
      "Timestamp,aircraft,weight",
      "2026-04-01T09:00:00.000Z,ZE122,410"
    ].join("\n"),
  );

  const result = processAircraftIssue({
    csvPath,
    issueBody: buildIssueBody({
      aircraft: "ZE123",
      weight: "416.25",
      email: "pilot@mod.gov.uk"
    }),
    issueCreatedAt: "2026-04-13T09:15:00.000Z"
  });

  assert.deepEqual(result, {
    aircraft: "ZE123",
    weight: "416.25",
    submitterEmail: "pilot@mod.gov.uk",
    changeAction: "added"
  });
  assert.match(fs.readFileSync(csvPath, "utf8"), /2026-04-13T09:15:00\.000Z,ZE123,416\.25/);
});

test("submission validation rejects an unapproved email domain", () => {
  assert.throws(
    () =>
      parseAndValidateIssueSubmission(
        buildIssueBody({
          email: "pilot@example.com"
        }),
      ),
    /Submitter email must use either/,
  );
});

test("submission validation rejects a tail number outside the ZE### format", () => {
  assert.throws(
    () =>
      parseAndValidateIssueSubmission(
        buildIssueBody({
          aircraft: "ZF123"
        }),
      ),
    /Aircraft tail number must match `ZE` followed by three digits/,
  );
});

test("submission validation rejects a weight outside the allowed range", () => {
  assert.throws(
    () =>
      parseAndValidateIssueSubmission(
        buildIssueBody({
          weight: "520"
        }),
      ),
    /Aircraft weight must be between 380 and 500 kg/,
  );
});

test("pull request verification accepts a matching single-row CSV update", () => {
  const result = validateAircraftPullRequest({
    issueBody: buildIssueBody({
      aircraft: "ZE124",
      weight: "420.5",
      email: "pilot@rafac.mod.gov.uk"
    }),
    issueLabels: ["aircraft-submission"],
    prBody: [
      "Updates `assets/aircraft_weights.csv` from issue #42.",
      "",
      "Change type: `added`",
      "Aircraft: `ZE124`",
      "Weight: `420.5 kg`",
      "Submitter email: `pilot@rafac.mod.gov.uk`",
      "",
      "Closes #42"
    ].join("\n"),
    prHeadRef: "automation/add-aircraft-42",
    changedFiles: ["assets/aircraft_weights.csv"],
    baseCsvText: [
      "Timestamp,aircraft,weight",
      "2026-04-01T09:00:00.000Z,ZE123,410"
    ].join("\n"),
    headCsvContent: [
      "Timestamp,aircraft,weight",
      "2026-04-01T09:00:00.000Z,ZE123,410",
      "2026-04-13T09:15:00.000Z,ZE124,420.5"
    ].join("\n")
  });

  assert.deepEqual(result, {
    issueNumber: "42",
    aircraft: "ZE124",
    weight: "420.5",
    submitterEmail: "pilot@rafac.mod.gov.uk"
  });
});

test("pull request verification rejects unrelated CSV changes", () => {
  assert.throws(
    () =>
      validateAircraftPullRequest({
        issueBody: buildIssueBody({
          aircraft: "ZE124",
          weight: "420.5",
          email: "pilot@rafac.mod.gov.uk"
        }),
        issueLabels: ["aircraft-submission"],
        prBody: "Closes #42",
        prHeadRef: "automation/add-aircraft-42",
        changedFiles: ["assets/aircraft_weights.csv"],
        baseCsvText: [
          "Timestamp,aircraft,weight",
          "2026-04-01T09:00:00.000Z,ZE123,410"
        ].join("\n"),
        headCsvContent: [
          "Timestamp,aircraft,weight",
          "2026-04-13T09:15:00.000Z,ZE123,411",
          "2026-04-13T09:15:00.000Z,ZE124,420.5"
        ].join("\n")
      }),
    /Pull request must only add or update ZE124/,
  );
});

function buildIssueBody({
  aircraft = "ZE123",
  weight = "416.25",
  email = "pilot@rafac.mod.gov.uk",
  confirmed = true
} = {}) {
  return [
    "### Aircraft tail number",
    aircraft,
    "",
    "### Aircraft weight (kg)",
    weight,
    "",
    "### Submitter email",
    email,
    "",
    "### Confirmation",
    `- [${confirmed ? "x" : " "}] I have checked the aircraft tail number and weight before submitting.`
  ].join("\n");
}
