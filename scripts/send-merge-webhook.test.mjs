import assert from "node:assert/strict";
import test from "node:test";
import { buildWebhookPayload, loadConfig } from "./send-merge-webhook.mjs";

test("loadConfig normalises the webhook sender environment", () => {
  const config = loadConfig({
    WEBHOOK_URL: "https://example.test/webhook",
    WEBHOOK_API_KEY: "secret-key",
    WEBHOOK_EVENT: "aircraft_submission_merged_test",
    REPOSITORY_FULL_NAME: "2FTS-RAF/ballast",
    GITHUB_SERVER_URL: "https://github.com",
    AIRCRAFT: "ZE123",
    WEIGHT_KG: "416.25",
    SUBMITTER_EMAIL: "pilot@rafac.mod.gov.uk",
    ISSUE_NUMBER: "42",
    PULL_REQUEST_NUMBER: "99",
    MERGE_COMMIT_SHA: "0000000000000000000000000000000000000000",
    MERGED_AT: "2026-04-13T10:00:00.000Z"
  });

  assert.deepEqual(config, {
    webhookUrl: "https://example.test/webhook",
    webhookApiKey: "secret-key",
    eventName: "aircraft_submission_merged_test",
    repository: "ballast",
    repositoryFullName: "2FTS-RAF/ballast",
    aircraft: "ZE123",
    weightKg: 416.25,
    submitterEmail: "pilot@rafac.mod.gov.uk",
    issueNumber: 42,
    issueUrl: "https://github.com/2FTS-RAF/ballast/issues/42",
    pullRequestNumber: 99,
    pullRequestUrl: "https://github.com/2FTS-RAF/ballast/pull/99",
    mergeCommitSha: "0000000000000000000000000000000000000000",
    mergedAt: "2026-04-13T10:00:00.000Z"
  });
});

test("buildWebhookPayload returns the production payload shape", () => {
  const payload = buildWebhookPayload({
    eventName: "aircraft_submission_merged",
    repository: "ballast",
    repositoryFullName: "2FTS-RAF/ballast",
    aircraft: "ZE123",
    weightKg: 416.25,
    submitterEmail: "pilot@rafac.mod.gov.uk",
    issueNumber: 42,
    issueUrl: "https://github.com/2FTS-RAF/ballast/issues/42",
    pullRequestNumber: 99,
    pullRequestUrl: "https://github.com/2FTS-RAF/ballast/pull/99",
    mergeCommitSha: "1111111111111111111111111111111111111111",
    mergedAt: "2026-04-13T10:00:00.000Z"
  });

  assert.deepEqual(payload, {
    event: "aircraft_submission_merged",
    repository: "ballast",
    repositoryFullName: "2FTS-RAF/ballast",
    aircraft: "ZE123",
    weightKg: 416.25,
    submitterEmail: "pilot@rafac.mod.gov.uk",
    issueNumber: 42,
    issueUrl: "https://github.com/2FTS-RAF/ballast/issues/42",
    pullRequestNumber: 99,
    pullRequestUrl: "https://github.com/2FTS-RAF/ballast/pull/99",
    mergeCommitSha: "1111111111111111111111111111111111111111",
    mergedAt: "2026-04-13T10:00:00.000Z"
  });
});
