const DB_NAME = "schoolcal-db";
const DB_VERSION = 1;
const STORE_NAME = "events";
const ORIGINS = {
  NSWDOE: "NSWDOE",
  SENTRAL: "Sentral",
  PERSONAL: "personal",
};

const dom = {
  yearDisplay: document.getElementById("yearDisplay"),
  selectedDateLabel: document.getElementById("selectedDateLabel"),
  eventDateHeading: document.getElementById("eventDateHeading"),
  eventList: document.getElementById("eventList"),
  eventCount: document.getElementById("eventCount"),
  datePicker: document.getElementById("datePicker"),
  filterInput: document.getElementById("filterInput"),
  clearFilter: document.getElementById("clearFilter"),
  modalOverlay: document.getElementById("modalOverlay"),
  quickAddButton: document.getElementById("quickAddButton"),
  eventForm: document.getElementById("eventForm"),
  importButton: document.getElementById("nswImportButton"),
  importInput: document.getElementById("nswFileInput"),
  dayView: document.getElementById("dayView"),
  termGrid: document.getElementById("termGrid"),
  clearEventsButton: document.getElementById("clearEventsButton"),
  workspaceTitle: document.getElementById("workspaceTitle"),
  workspaceSubtitle: document.getElementById("workspaceSubtitle"),
  weekLetterToggle: document.getElementById("weekLetterToggle"),
  sentralImportButton: document.getElementById("sentralImportButton"),
  sentralInput: document.getElementById("sentralFileInput"),
  modalErrorMessage: document.getElementById("modalErrorMessage"),
  toastContainer: document.getElementById("toastContainer"),
  yearFilterInputs: document.querySelectorAll(".year-filter-input"),
  exportJsonButton: document.getElementById("exportJsonButton"),
  importJsonButton: document.getElementById("importJsonButton"),
  jsonFileInput: document.getElementById("jsonFileInput"),
  sidebarToggle: document.getElementById("sidebarToggle"),
};

const WEEK_LETTER_KEY = "schoolcal-week-letters";

const state = {
  events: [],
  selectedDate: new Date(),
  filter: "",
  viewMode: "term",
  termWeeks: [],
  termGroups: [],
  weekLetterMap: loadWeekLetterPreferences(),
  yearFilters: new Set(),
  isSidebarHidden: false,
};

const dataStore = {
  db: null,
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  },
  transaction(mode = "readonly") {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }
    const tx = this.db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  },
  listEvents() {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction("readonly");
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
      } catch (error) {
        reject(error);
      }
    });
  },
  saveEvent(record) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction("readwrite");
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = (event) => reject(event.target.error);
      } catch (error) {
        reject(error);
      }
    });
  },
  deleteEvent(id) {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction("readwrite");
        const request = store.delete(id);
        request.onsuccess = resolve;
        request.onerror = (event) => reject(event.target.error);
      } catch (error) {
        reject(error);
      }
    });
  },
  clearAll() {
    return new Promise((resolve, reject) => {
      try {
        const store = this.transaction("readwrite");
        const request = store.clear();
        request.onsuccess = resolve;
        request.onerror = (event) => reject(event.target.error);
      } catch (error) {
        reject(error);
      }
    });
  },
};

function toLocaleLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toEventHeading(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(iso) {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day);
}

function toISO(date) {
  return formatISODate(date);
}

function openDB() {
  dataStore
    .open()
    .then(() => refreshEvents())
    .catch(() => console.error("Unable to open IndexedDB."));
}

function refreshEvents() {
  if (!dataStore.db) return;
  dataStore.listEvents()
    .then((events) => {
      const sorted = events.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      state.events = sorted;
      state.termWeeks = buildTermWeeks(sorted);
      state.termGroups = buildTermGroups(state.termWeeks);
      render();
    })
    .catch((error) => console.error("Unable to fetch events", error));
}

function eventMatchesFilter(event, filter = state.filter) {
  const text = (filter || "").trim().toLowerCase();
  const textMatch =
    !text ||
    event.title.toLowerCase().includes(text) ||
    (event.subject && event.subject.toLowerCase().includes(text)) ||
    (event.notes && event.notes.toLowerCase().includes(text));
  return textMatch && matchesYearFilters(event);
}

function matchesYearFilters(event) {
  if (!state.yearFilters?.size) return true;
  const entries = Array.from(state.yearFilters);
  return entries.some((year) => eventHasYearNumber(event, year));
}

function eventHasYearNumber(event, yearNumber) {
  if (!yearNumber) return false;
  const normalized = String(yearNumber);
  const label = `Year ${normalized}`;
  if (event.yearTags?.some((tag) => tag === label)) {
    return true;
  }
  const text = `${event.title ?? ""} ${event.subject ?? ""} ${event.notes ?? ""}`;
  return includesYearReference(text, normalized);
}

function includesYearReference(value, yearNumber) {
  if (!value) return false;
  const regex = new RegExp(`\\b(?:year|yr)\\s*${yearNumber}\\b`, "i");
  return regex.test(value);
}

function render() {
  const dateString = toLocaleLabel(state.selectedDate);
  dom.yearDisplay.textContent = state.selectedDate.getFullYear();
  dom.selectedDateLabel.textContent = dateString;
  dom.eventDateHeading.textContent = toEventHeading(state.selectedDate);
  dom.datePicker.value = toISO(state.selectedDate);

  const targeted = state.events.filter(
    (entry) =>
      entry.type !== "term" &&
      entry.date === toISO(state.selectedDate) &&
      eventMatchesFilter(entry, state.filter)
  );

  dom.eventCount.textContent = `${targeted.length} events`;

  const group = getSelectedTermGroup();
  const weeks = group?.weeks || [];
  if (state.viewMode === "term" && group && weeks.length) {
    dom.workspaceTitle.textContent = group.termName;
    dom.workspaceSubtitle.textContent = formatTermRange(group.startDate, group.endDate);
  } else {
    dom.workspaceTitle.textContent = "Term view";
    dom.workspaceSubtitle.textContent = "";
  }

  const dayMode = state.viewMode === "day";
  dom.dayView?.classList.toggle("hidden", !dayMode);
  dom.termGrid?.classList.toggle("hidden", dayMode);
  if (!dayMode) {
    renderTermView(group);
  }
  if (dom.weekLetterToggle) {
    if (group) {
      const letter = state.weekLetterMap[group.termName] || "A";
      dom.weekLetterToggle.textContent = `First week ${letter}`;
      dom.weekLetterToggle.disabled = false;
    } else {
      dom.weekLetterToggle.textContent = "First week A";
      dom.weekLetterToggle.disabled = true;
    }
  }

  dom.eventList.innerHTML = "";
  if (!targeted.length) {
    const placeholder = document.createElement("p");
    placeholder.textContent = "No events scheduled for this day.";
    placeholder.style.color = "var(--muted)";
    dom.eventList.appendChild(placeholder);
    return;
  }

  targeted.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.style.borderLeftColor = event.color || "var(--accent)";

    const text = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = event.title;
    title.style.margin = "0 0 6px";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${event.subject || "General"}</span><span>${event.notes ? "Notes" : "No notes"}</span>`;
    const notes = document.createElement("p");
    notes.style.margin = "6px 0 0";
    notes.style.color = "var(--muted)";
    notes.textContent = event.notes ? event.notes : "Tap to add more context.";

    text.append(title, meta, notes);

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "🗑";
    deleteButton.title = "Remove event";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm("Remove this event?")) return;
      dataStore.deleteEvent(event.id)
        .then(() => {
          refreshEvents();
          showToast("Event removed", "success");
        })
        .catch((error) => {
          console.error("Unable to remove event", error);
          showToast("Unable to remove event", "error");
        });
    });

    card.append(text, deleteButton);
    dom.eventList.appendChild(card);
  });
}

function renderTermView(group) {
  const container = dom.termGrid;
  if (!container) return;
  container.innerHTML = "";
  const weeksToShow = group?.weeks || [];
  if (!weeksToShow.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "empty-note";
    placeholder.textContent = "No term data available yet.";
    container.appendChild(placeholder);
    return;
  }
  const filteredEventsForTerm = state.events.filter(
    (entry) => entry.type !== "term" && eventMatchesFilter(entry)
  );
  const eventsByDate = groupEventsByDate(filteredEventsForTerm);

  weeksToShow.forEach((week, index) => {
    const weekSection = document.createElement("article");
    weekSection.className = "term-week";

    const header = document.createElement("div");
    header.className = "term-week-header";
    const letter = group ? getWeekLetter(group.termName, index) : "A";
    const titleWithLetter = `${week.weekLabel}${letter.toLowerCase()}`;
    header.innerHTML = `
      <div>
        <p class="term-week-title">${titleWithLetter}</p>
        <p class="term-week-detail">${formatTermRange(
          week.startDate,
          week.endDate
        )}</p>
      </div>
      <span class="term-week-notes">${week.notes || ""}</span>
    `;

    const daysWrap = document.createElement("div");
    daysWrap.className = "term-week-days";

    generateWeekDays(week.startDate).forEach((day) => {
      const dayCard = document.createElement("div");
      dayCard.className = "term-day";

      const label = document.createElement("p");
      label.className = "term-day-label";
      label.textContent = day.label;
      dayCard.appendChild(label);

      const list = document.createElement("ul");
      list.className = "term-day-event-list";
      const dayEvents = eventsByDate[day.iso] || [];
      if (!dayEvents.length) {
        const empty = document.createElement("li");
        empty.className = "term-day-event-empty";
        empty.textContent = "No scheduled events";
        list.appendChild(empty);
      } else {
        dayEvents.forEach((event) => {
          const item = document.createElement("li");
          item.className = "term-day-event";
          item.style.borderLeftColor = event.color || "var(--accent)";
          item.innerHTML = `
            <span class="term-day-event-title">${event.title}</span>
            <span class="term-day-event-meta">${event.subject || ""}</span>
          `;
          list.appendChild(item);
        });
      }

      dayCard.appendChild(list);
      daysWrap.appendChild(dayCard);
    });

    weekSection.append(header, daysWrap);
    container.appendChild(weekSection);
  });
}

function sanitizeId(value) {
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 40);
}

function parseTermName(title) {
  const match = title?.match(/(Term\s*\d+)/i);
  return match ? match[1] : "Term";
}

function parseWeekLabel(title) {
  const match = title?.match(/Week\s*(\d+)/i);
  return match ? `Week ${match[1]}` : "Week";
}

function generateWeekDays(startIso) {
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

function groupEventsByDate(events) {
  return events.reduce((acc, event) => {
    if (!event.date) return acc;
    const key = event.date;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(event);
    return acc;
  }, {});
}

function buildTermWeeks(events) {
  const map = new Map();
  events
    .filter((entry) => entry.type === "term" && entry.startDate && entry.endDate)
    .forEach((entry) => {
      const termName = parseTermName(entry.title);
      const weekLabel = parseWeekLabel(entry.title);
      const key = `${termName}-${weekLabel}`;
      if (!map.has(key) || new Date(entry.startDate) < new Date(map.get(key).startDate)) {
        map.set(key, {
          id: entry.id,
          title: entry.title,
          termName,
          weekLabel,
          startDate: entry.startDate,
          endDate: entry.endDate,
          notes: entry.notes,
        });
      }
    });
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );
}

function buildTermGroups(weeks) {
  const map = new Map();
  weeks.forEach((week) => {
    if (!week.termName) return;
    if (!map.has(week.termName)) {
      map.set(week.termName, {
        termName: week.termName,
        weeks: [],
        startDate: week.startDate,
        endDate: week.endDate,
      });
    }
    const group = map.get(week.termName);
    group.weeks.push(week);
    const start = new Date(group.startDate);
    const end = new Date(group.endDate);
    const candidateStart = new Date(week.startDate);
    const candidateEnd = new Date(week.endDate);
    if (candidateStart < start || Number.isNaN(start.getTime())) {
      group.startDate = week.startDate;
    }
    if (candidateEnd > end || Number.isNaN(end.getTime())) {
      group.endDate = week.endDate;
    }
  });

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      weeks: group.weeks.sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      ),
    }))
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
}

function formatTermRange(start, end) {
  const startDate = parseISODate(start) || new Date(start);
  const endDate = parseISODate(end) || new Date(end);
  const startLabel = startDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const endLabel = endDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `${startLabel} - ${endLabel}`;
}

function showToast(message, variant = "info", duration = 3200) {
  if (!dom.toastContainer || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  const cleanup = () => {
    toast.removeEventListener("transitionend", cleanup);
    toast.remove();
  };
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", cleanup, { once: true });
  }, duration);
}

function showModalError(message) {
  if (!dom.modalErrorMessage) return;
  dom.modalErrorMessage.textContent = message || "";
}

function clearModalError() {
  showModalError("");
}

function updateSidebarState() {
  const collapsed = state.isSidebarHidden;
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  if (dom.sidebarToggle) {
    dom.sidebarToggle.setAttribute("aria-expanded", (!collapsed).toString());
  }
}

function toggleSidebar() {
  state.isSidebarHidden = !state.isSidebarHidden;
  updateSidebarState();
}

function getSelectedTermGroup() {
  const iso = toISO(state.selectedDate);
  const group = state.termGroups.find(
    (entry) => iso >= entry.startDate && iso <= entry.endDate
  );
  return group || state.termGroups[0] || null;
}

function getWeekLetter(termName, weekIndex) {
  if (!termName) return "A";
  const startLetter = state.weekLetterMap[termName] || "A";
  const offset = startLetter === "B" ? 1 : 0;
  const parity = (weekIndex + offset) % 2;
  return parity === 0 ? "A" : "B";
}

function toggleWeekLetterForTerm(termName) {
  if (!termName) return;
  const current = state.weekLetterMap[termName] || "A";
  state.weekLetterMap[termName] = current === "A" ? "B" : "A";
  saveWeekLetterPreferences();
}

function loadWeekLetterPreferences() {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(WEEK_LETTER_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveWeekLetterPreferences() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(WEEK_LETTER_KEY, JSON.stringify(state.weekLetterMap));
  } catch {
    // ignore storage errors
  }
}

function normalizeDate(dateValue) {
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

function parseCSV(text) {
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

function parseCSVRecords(text) {
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

function mapRowToEvent(row, sourceKey = "nsw-doe", origin = ORIGINS.NSWDOE) {
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
    createdAt: new Date().toISOString(),
    startDate: normalizeDate(row.StartDate) || date,
    endDate: normalizeDate(row.EndDate) || date,
  };
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

function getYearTagsFromText(text) {
  const tags = new Set();
  addYearTagsFromText(tags, text);
  return Array.from(tags);
}

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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function downloadJSON(filename, payload) {
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

function buildEventId(entry, date, origin) {
  const source = (entry.source || origin || "import").toString().toLowerCase();
  const base = entry.id || `${entry.title}-${date}`;
  return `${source}-${sanitizeId(base)}-${date.replace(/-/g, "")}`;
}

function normalizeImportedEvent(entry) {
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
    createdAt: entry.createdAt || new Date().toISOString(),
    type: entry.type || "event",
  };
}

async function importCalendarFile(file, button, input, sourceKey, origin, displayName) {
  if (!dataStore.db || !file) return;
  if (button) {
    button.disabled = true;
  }
  try {
    const text = await readFileAsText(file);
    const rows = parseCSVRecords(text);
    const events = rows
      .map((row) => mapRowToEvent(row, sourceKey, origin))
      .filter((entry) => entry && entry.date && entry.title);
    await Promise.all(events.map((entry) => dataStore.saveEvent(entry)));
    refreshEvents();
    showToast(`Imported ${events.length} ${displayName} entries.`, "success");
  } catch (error) {
    console.error("Import failed", error);
    showToast(`Failed to import ${displayName} data.`, "error");
  } finally {
    if (button) {
      button.disabled = false;
    }
    if (input) {
      input.value = "";
    }
  }
}

function addWorkingDays(step) {
  const next = new Date(state.selectedDate);
  const direction = step >= 0 ? 1 : -1;
  do {
    next.setDate(next.getDate() + direction);
  } while (next.getDay() === 0 || next.getDay() === 6);
  state.selectedDate = next;
  render();
}

function validateEventForm(form) {
  clearModalError();
  const title = form.title.value.trim();
  if (!title) {
    showModalError("Please provide an event title.");
    return null;
  }
  const normalizedDate = normalizeDate(form.date.value);
  if (!normalizedDate) {
    showModalError("Please choose a valid date.");
    return null;
  }
  return {
    title,
    date: normalizedDate,
    subject: form.subject.value.trim(),
    notes: form.notes.value.trim(),
    color: form.color.value,
  };
}

function getTermGroupIndex() {
  const group = getSelectedTermGroup();
  if (!group) return -1;
  return state.termGroups.findIndex(
    (entry) =>
      entry.termName === group.termName &&
      entry.startDate === group.startDate &&
      entry.endDate === group.endDate
  );
}

function changeTerm(step) {
  if (!state.termGroups.length) return;
  const currentIndex = getTermGroupIndex();
  let nextIndex =
    currentIndex === -1 ? (step > 0 ? 0 : state.termGroups.length - 1) : currentIndex + step;
  if (nextIndex < 0) nextIndex = 0;
  if (nextIndex >= state.termGroups.length) nextIndex = state.termGroups.length - 1;
  const term = state.termGroups[nextIndex];
  if (term) {
    state.selectedDate = new Date(term.startDate);
    render();
  }
}

function navigateByView(step) {
  if (state.viewMode === "term") {
    changeTerm(step);
  } else {
    addWorkingDays(step);
  }
}

function changeYear(step) {
  const next = new Date(state.selectedDate);
  next.setFullYear(next.getFullYear() + step);
  state.selectedDate = next;
  render();
}

function bindUI() {
  document.querySelectorAll("[data-date-step]").forEach((button) => {
    button.addEventListener("click", () => navigateByView(Number(button.dataset.dateStep)));
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => changeYear(button.dataset.nav === "next" ? 1 : -1));
  });

  dom.datePicker.addEventListener("change", (event) => {
    const parsed = parseISODate(event.target.value);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      state.selectedDate = parsed;
      render();
    }
  });

  dom.filterInput.addEventListener("input", (event) => {
    state.filter = event.target.value.trim();
    render();
  });

  dom.clearFilter.addEventListener("click", () => {
    dom.filterInput.value = "";
    state.filter = "";
    render();
  });

  dom.yearFilterInputs?.forEach((input) => {
    input.addEventListener("change", () => {
      const year = input.dataset.year;
      if (!year) return;
      if (input.checked) {
        state.yearFilters.add(year);
      } else {
        state.yearFilters.delete(year);
      }
      render();
    });
  });

  dom.quickAddButton.addEventListener("click", () => {
    dom.modalOverlay.classList.add("active");
    dom.modalOverlay.setAttribute("aria-hidden", "false");
    dom.eventForm.reset();
    dom.eventForm.elements.date.value = toISO(state.selectedDate);
    clearModalError();
  });

  dom.modalOverlay.addEventListener("click", (event) => {
    if (event.target === dom.modalOverlay) {
      hideModal();
    }
  });

  document.getElementById("modalCancel").addEventListener("click", hideModal);

  dom.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const values = validateEventForm(form);
    if (!values) return;
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: values.title,
      date: values.date,
      subject: values.subject,
      notes: values.notes,
      color: values.color,
      createdAt: new Date().toISOString(),
      startDate: values.date,
      endDate: values.date,
      yearTags: getYearTagsFromText(`${values.title} ${values.subject} ${values.notes}`),
      origin: ORIGINS.PERSONAL,
      source: ORIGINS.PERSONAL,
    };
    dataStore.saveEvent(record)
      .then(() => {
        hideModal();
        refreshEvents();
        showToast("Event saved", "success");
      })
      .catch((error) => {
        console.error("Unable to save event", error);
        showToast("Unable to save event", "error");
      });
  });

  document.querySelectorAll(".toggle").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".toggle").forEach((btn) => btn.classList.remove("selected"));
      button.classList.add("selected");
      const nextView = button.dataset.view;
      if (nextView) {
        state.viewMode = nextView;
        render();
      }
    });
  });

  dom.importButton?.addEventListener("click", () => {
    dom.importInput?.click();
  });
  dom.importInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      importCalendarFile(
        file,
        dom.importButton,
        dom.importInput,
        "nsw-doe",
        ORIGINS.NSWDOE,
        "NSW DOE"
      );
    }
  });
  dom.sentralImportButton?.addEventListener("click", () => {
    dom.sentralInput?.click();
  });
  dom.sentralInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      importCalendarFile(
        file,
        dom.sentralImportButton,
        dom.sentralInput,
        "sentral",
        ORIGINS.SENTRAL,
        "Sentral"
      );
    }
  });

  dom.exportJsonButton?.addEventListener("click", async () => {
    if (!dataStore.db) return;
    try {
      const entries = await dataStore.listEvents();
      if (!entries.length) {
        showToast("No events to export.", "info");
        return;
      }
      const fileName = `schoolcal-export-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJSON(fileName, entries);
      showToast("JSON export ready.", "success");
    } catch (error) {
      console.error("JSON export failed", error);
      showToast("JSON export failed.", "error");
    }
  });

  dom.importJsonButton?.addEventListener("click", () => {
    dom.jsonFileInput?.click();
  });

  dom.jsonFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON payload must be an array.");
      }
      const events = parsed.map(normalizeImportedEvent).filter(Boolean);
      if (!events.length) {
        showToast("No valid records found in JSON.", "error");
        return;
      }
      await Promise.all(events.map((entry) => dataStore.saveEvent(entry)));
      refreshEvents();
      showToast(`${events.length} records imported.`, "success");
    } catch (error) {
      console.error("JSON import failed", error);
      showToast("JSON import failed.", "error");
    } finally {
      event.target.value = "";
    }
  });

  dom.clearEventsButton?.addEventListener("click", async () => {
    if (!dataStore.db) return;
    if (!window.confirm("This will remove every local event. Continue?")) return;
    dom.clearEventsButton.disabled = true;
    try {
      await dataStore.clearAll();
      refreshEvents();
      showToast("All local events have been cleared.", "success");
    } catch (error) {
      console.error("Unable to clear events", error);
      showToast("Failed to clear events.", "error");
    } finally {
      dom.clearEventsButton.disabled = false;
    }
  });

  dom.weekLetterToggle?.addEventListener("click", () => {
    const group = getSelectedTermGroup();
    if (!group) return;
    toggleWeekLetterForTerm(group.termName);
    render();
  });

  dom.sidebarToggle?.addEventListener("click", toggleSidebar);
  updateSidebarState();

}

function hideModal() {
  dom.modalOverlay.classList.remove("active");
  dom.modalOverlay.setAttribute("aria-hidden", "true");
  clearModalError();
}

if ("indexedDB" in window) {
  window.addEventListener("load", () => {
    openDB();
    bindUI();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("sw.js")
        .catch((error) => console.error("Service worker registration failed", error));
    }
  });
} else {
  console.warn("IndexedDB is not supported in this browser.");
}
