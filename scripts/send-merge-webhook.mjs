import { pathToFileURL } from "node:url";

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export async function main({
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const config = loadConfig(env);
  const payload = buildWebhookPayload(config);
  const response = await fetchImpl(config.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-make-apikey": config.webhookApiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Merge webhook failed with status ${response.status}: ${responseBody}`);
  }

  console.info(`Sent merge webhook event ${payload.event} for ${payload.aircraft}.`);
  return payload;
}

export function buildWebhookPayload({
  eventName,
  repository,
  repositoryFullName,
  aircraft,
  weightKg,
  submitterEmail,
  issueNumber,
  issueUrl,
  pullRequestNumber,
  pullRequestUrl,
  mergeCommitSha,
  mergedAt
}) {
  return {
    event: eventName,
    repository,
    repositoryFullName,
    aircraft,
    weightKg,
    submitterEmail,
    issueNumber,
    issueUrl,
    pullRequestNumber,
    pullRequestUrl,
    mergeCommitSha,
    mergedAt
  };
}

export function loadConfig(env) {
  const webhookUrl = requireEnv(env, "WEBHOOK_URL");
  const webhookApiKey = requireEnv(env, "WEBHOOK_API_KEY");
  const eventName = requireEnv(env, "WEBHOOK_EVENT");
  const repositoryFullName = requireEnv(env, "REPOSITORY_FULL_NAME");
  const repository = env.REPOSITORY_NAME || repositoryFullName.split("/").pop();
  const serverUrl = env.GITHUB_SERVER_URL || "https://github.com";
  const aircraft = requireEnv(env, "AIRCRAFT");
  const weightKg = parseNumberEnv(env, "WEIGHT_KG");
  const submitterEmail = requireEnv(env, "SUBMITTER_EMAIL");
  const issueNumber = parseNumberEnv(env, "ISSUE_NUMBER");
  const pullRequestNumber = parseNumberEnv(env, "PULL_REQUEST_NUMBER");
  const mergeCommitSha = requireEnv(env, "MERGE_COMMIT_SHA");
  const mergedAt = env.MERGED_AT || new Date().toISOString();

  return {
    webhookUrl,
    webhookApiKey,
    eventName,
    repository,
    repositoryFullName,
    aircraft,
    weightKg,
    submitterEmail,
    issueNumber,
    issueUrl: env.ISSUE_URL || `${serverUrl}/${repositoryFullName}/issues/${issueNumber}`,
    pullRequestNumber,
    pullRequestUrl: env.PULL_REQUEST_URL || `${serverUrl}/${repositoryFullName}/pull/${pullRequestNumber}`,
    mergeCommitSha,
    mergedAt
  };
}

function requireEnv(env, name) {
  const value = String(env[name] || "").trim();

  if (!value) {
    throw new Error(`Environment variable ${name} is required.`);
  }

  return value;
}

function parseNumberEnv(env, name) {
  const value = requireEnv(env, name);
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be numeric.`);
  }

  return parsed;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
}
