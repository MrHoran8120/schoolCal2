export function getCurrentTimestamp() {
  return new Date().toISOString();
}

export function toLocaleLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function toEventHeading(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(iso) {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

export function toISO(date) {
  return formatISODate(date);
}

export function formatTimeAgo(iso) {
  if (!iso) return "just now";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "just now";
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - target) / 1000));
  if (deltaSeconds < 60) return "just now";
  if (deltaSeconds < 3600) return `${Math.round(deltaSeconds / 60)} minutes ago`;
  if (deltaSeconds < 86400) return `${Math.round(deltaSeconds / 3600)} hours ago`;
  return `${Math.round(deltaSeconds / 86400)} days ago`;
}

export function getLatestLastModified(events) {
  if (!Array.isArray(events) || !events.length) return null;
  return events.reduce((latest, entry) => {
    if (!entry?.lastModified) return latest;
    if (!latest) return entry.lastModified;
    return new Date(entry.lastModified) > new Date(latest) ? entry.lastModified : latest;
  }, null);
}

export function sanitizeId(value) {
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 40);
}

export function normalizeDate(dateValue) {
  if (!dateValue) {
    return "";
  }
  const trimmed = dateValue.toString().trim();
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoMatch) {
    return trimmed;
  }

  const parts = trimmed.split(/[\/\\-]/).map((segment) => parseInt(segment, 10));
  if (parts.length >= 3 && parts.every((value) => !Number.isNaN(value))) {
    let [first, second, third] = parts;
    let day = first;
    let month = second;
    let year = third;
    if (day > 31) {
      [day, month] = [month, day];
    }
    if (year < 100) {
      year += 2000;
    }
    const candidate = new Date(year, month - 1, day);
    if (!Number.isNaN(candidate.getTime())) {
      return formatISODate(candidate);
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatISODate(parsed);
  }
  return "";
}

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    if (row.length || field) {
      pushField();
      rows.push(row);
      row = [];
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      pushField();
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i++;
      }
      pushRow();
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    pushRow();
  }

  return rows;
}

export function parseCSVRecords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows.shift().map((value) => value.trim());
  return rows.map((cols) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = (cols[index] || "").trim();
    });
    return record;
  });
}

export function generateWeekDays(startIso) {
  const start = parseISODate(startIso) || new Date(startIso);
  if (!start || Number.isNaN(start.getTime())) return [];
  const mondayShift = (start.getDay() + 6) % 7;
  const base = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  base.setDate(base.getDate() - mondayShift);
  const days = [];
  for (let i = 0; i < 5; i++) {
    const current = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    current.setDate(base.getDate() + i);
    days.push({
      iso: formatISODate(current),
      label: current.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    });
  }
  return days;
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function downloadJSON(filename, payload) {
  if (!payload?.length) return;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
