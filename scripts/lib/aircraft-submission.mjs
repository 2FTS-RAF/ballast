export const AIRCRAFT_SUBMISSION_LABEL = "aircraft-submission";
export const AUTOMATION_BRANCH_PREFIX = "automation/add-aircraft-";
export const AIRCRAFT_CSV_PATH = "assets/aircraft_weights.csv";
export const ALLOWED_EMAIL_DOMAINS = ["rafac.mod.gov.uk", "mod.gov.uk"];
export const MIN_AIRCRAFT_WEIGHT_KG = 380;
export const MAX_AIRCRAFT_WEIGHT_KG = 500;

export function parseAndValidateIssueSubmission(markdown) {
  const fields = parseIssueBody(markdown);

  return {
    aircraft: normaliseAircraft(fields["Aircraft tail number"]),
    weight: normaliseWeight(fields["Aircraft weight (kg)"]),
    submitterEmail: normaliseEmail(fields["Submitter email"]),
    confirmation: assertConfirmation(fields["Confirmation"])
  };
}

export function parseIssueBody(markdown) {
  const normalised = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
  const fields = {};

  if (!normalised) {
    return fields;
  }

  let currentLabel = "";
  let currentValueLines = [];

  const flushField = () => {
    if (!currentLabel) {
      return;
    }

    fields[currentLabel] = currentValueLines.join("\n").trim();
  };

  normalised.split("\n").forEach((line) => {
    const headingMatch = line.match(/^###\s+(.+?)\s*$/);

    if (headingMatch) {
      flushField();
      currentLabel = headingMatch[1].trim();
      currentValueLines = [];
      return;
    }

    if (currentLabel) {
      currentValueLines.push(line);
    }
  });

  flushField();
  return fields;
}

export function parseCsv(text) {
  const normalised = String(text || "").replace(/\r\n/g, "\n").trim();

  if (!normalised) {
    return [];
  }

  const lines = normalised.split("\n");
  const headers = splitCsvRow(lines[0]);

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = splitCsvRow(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  });
}

export function stringifyCsv(rows) {
  const headers = ["Timestamp", "aircraft", "weight"];
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvValue(row[header] || "")).join(","));
  });

  return `${lines.join("\n")}\n`;
}

export function splitCsvRow(line) {
  const values = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        value += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

export function escapeCsvValue(value) {
  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

export function extractIssueNumberFromAutomationBranch(branchName) {
  const match = String(branchName || "").match(/^automation\/add-aircraft-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function extractClosedIssueNumber(prBody) {
  const match = String(prBody || "").match(/\bCloses\s+#(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function indexRowsByAircraft(rows, sourceLabel = "CSV") {
  const indexedRows = new Map();

  rows.forEach((row, rowIndex) => {
    const aircraft = String(row.aircraft || "").trim().toUpperCase();

    if (!aircraft) {
      throw new Error(`${sourceLabel} row ${rowIndex + 2} is missing an aircraft value.`);
    }

    if (indexedRows.has(aircraft)) {
      throw new Error(`${sourceLabel} contains a duplicate entry for ${aircraft}.`);
    }

    indexedRows.set(aircraft, {
      Timestamp: String(row.Timestamp || ""),
      aircraft,
      weight: String(row.weight || "").trim()
    });
  });

  return indexedRows;
}

export function normaliseAircraft(value) {
  const aircraft = String(value || "").trim().toUpperCase();

  if (!aircraft) {
    throw new Error("Aircraft tail number is required.");
  }

  if (!/^ZE\d{3}$/.test(aircraft)) {
    throw new Error("Aircraft tail number must match `ZE` followed by three digits, for example `ZE123`.");
  }

  return aircraft;
}

export function normaliseWeight(value) {
  const parsed = canonicaliseWeight(value);

  if (parsed < MIN_AIRCRAFT_WEIGHT_KG || parsed > MAX_AIRCRAFT_WEIGHT_KG) {
    throw new Error(`Aircraft weight must be between ${MIN_AIRCRAFT_WEIGHT_KG} and ${MAX_AIRCRAFT_WEIGHT_KG} kg.`);
  }

  return String(Number(parsed.toFixed(4)));
}

export function canonicaliseWeight(value) {
  const normalised = String(value || "").trim();
  const parsed = Number.parseFloat(normalised);

  if (!normalised || !Number.isFinite(parsed)) {
    throw new Error("Aircraft weight must be a number.");
  }

  return parsed;
}

export function normaliseEmail(value) {
  const email = String(value || "").trim().toLowerCase();

  if (!email) {
    throw new Error("Submitter email is required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Submitter email is not a valid email address.");
  }

  const domain = email.split("@")[1];

  if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    throw new Error(`Submitter email must use either ${ALLOWED_EMAIL_DOMAINS.map((allowedDomain) => `\`${allowedDomain}\``).join(" or ")}.`);
  }

  return email;
}

function assertConfirmation(value) {
  if (!/\[x\]/i.test(String(value || ""))) {
    throw new Error("Confirmation checkbox must be ticked.");
  }

  return true;
}
