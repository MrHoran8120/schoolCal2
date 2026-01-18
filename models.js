import { normalizeDate, sanitizeId, getCurrentTimestamp } from "./utils.js";

export const ORIGINS = {
  NSWDOE: "NSWDOE",
  SENTRAL: "Sentral",
  PERSONAL: "personal",
};

function addYearTagsFromText(tagSet, text) {
  if (!text) return;
  const regex = /\b(?:year|yr)\s*(7|8|9|10|11|12)\b/gi;
  let match;
  while ((match = regex.exec(text))) {
    tagSet.add(`Year ${match[1]}`);
  }
}

function addYearTagsFromLevelField(tagSet, field) {
  if (!field) return;
  field
    .split(/[;,]/)
    .map((segment) => segment.trim())
    .forEach((segment) => {
      if (!segment) return;
      const numeric = parseInt(segment, 10);
      if (!Number.isNaN(numeric) && numeric >= 7 && numeric <= 12) {
        tagSet.add(`Year ${numeric}`);
      }
      addYearTagsFromText(tagSet, segment);
    });
}

function getYearTagsFromText(text) {
  const tags = new Set();
  addYearTagsFromText(tags, text);
  return Array.from(tags);
}

function getYearTagsForRow(row) {
  const tags = new Set();
  const textFields = [
    row.Title,
    row.Subject,
    row.Description,
    row.Groups,
    row.Type,
    row["Event"],
    row.Notes,
  ];
  textFields.forEach((field) => addYearTagsFromText(tags, field));
  addYearTagsFromLevelField(tags, row["Year Levels"] || row.YearLevels || row.Year);
  return Array.from(tags);
}

export function mapRowToEvent(row, sourceKey = "nsw-doe", origin = ORIGINS.NSWDOE) {
  const date =
    normalizeDate(row.Date) ||
    normalizeDate(row.StartDate) ||
    normalizeDate(row.EndDate);
  if (!date) return null;

  const title =
    row.Title || row.Subject || row["Event"] || row.Description || "Imported event";
  const baseId = row.ID ? row.ID : `${title}-${date}`;
  const id = `${sourceKey}-${sanitizeId(baseId)}-${date.replace(/-/g, "")}`;
  const notesParts = [];
  if (row.Description && row.Description !== title) {
    notesParts.push(row.Description);
  }
  if (row["Start Time"]) notesParts.push(`Start ${row["Start Time"]}`);
  if (row["End Time"]) notesParts.push(`End ${row["End Time"]}`);

  const subject =
    row.Groups ||
    row["Year Levels"] ||
    row.Subject ||
    row.Type ||
    row.Showtimeas ||
    "NSW DOE";

  const isTerm = title.toLowerCase().includes("term");
  const type = row.Type || (isTerm ? "term" : "event");
  const color = isTerm
    ? "#f3a712"
    : row.Type === "Recurring"
    ? "#6c63ff"
    : "#1d3c72";
  const yearTags = getYearTagsForRow(row);
  const now = getCurrentTimestamp();

  return {
    id,
    title,
    date,
    subject,
    notes: notesParts.join(" | "),
    color,
    source: sourceKey,
    type,
    yearTags,
    origin,
    createdAt: now,
    startDate: normalizeDate(row.StartDate) || date,
    endDate: normalizeDate(row.EndDate) || date,
    lastModified: now,
    syncStatus: "local",
  };
}

export function buildEventId(entry, date, origin) {
  const source = (entry.source || origin || "import").toString().toLowerCase();
  const base = entry.id || `${entry.title}-${date}`;
  return `${source}-${sanitizeId(base)}-${date.replace(/-/g, "")}`;
}

export function normalizeImportedEvent(entry) {
  if (!entry) return null;
  const normalizedDate = normalizeDate(entry.date);
  if (!normalizedDate) return null;
  const destinationOrigin = entry.origin || ORIGINS.PERSONAL;
  const startDate = normalizeDate(entry.startDate) || normalizedDate;
  const endDate = normalizeDate(entry.endDate) || normalizedDate;
  const id = buildEventId(entry, normalizedDate, destinationOrigin);
  return {
    id,
    title: entry.title || "Imported event",
    date: normalizedDate,
    startDate,
    endDate,
    subject: entry.subject || entry.Groups || entry.Subject || "",
    notes: entry.notes || entry.Description || "",
    color: entry.color || "#1d3c72",
    origin: destinationOrigin,
    source: entry.source || destinationOrigin,
    yearTags: Array.isArray(entry.yearTags)
      ? entry.yearTags
      : getYearTagsFromText(`${entry.title} ${entry.subject} ${entry.notes}`),
    createdAt: entry.createdAt || getCurrentTimestamp(),
    type: entry.type || "event",
    lastModified: entry.lastModified || getCurrentTimestamp(),
    syncStatus: entry.syncStatus || "local",
  };
}

export function validateEventForm(form) {
  const title = form.title.value.trim();
  if (!title) {
    return { error: "Please provide an event title." };
  }
  const normalizedDate = normalizeDate(form.date.value);
  if (!normalizedDate) {
    return { error: "Please choose a valid date." };
  }
  return {
    title,
    date: normalizedDate,
    subject: form.subject.value.trim(),
    notes: form.notes.value.trim(),
    color: form.color.value,
  };
}
