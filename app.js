import { dataStore, migrateSyncMetadata } from "./db.js";
import {
  mapRowToEvent,
  ORIGINS,
  normalizeImportedEvent,
  validateEventForm,
} from "./models.js";
import {
  parseCSVRecords,
  readFileAsText,
  downloadJSON,
  toISO,
} from "./utils.js";
import {
  render,
  showToast,
  showModalError,
  clearModalError,
  toggleSidebar,
  updateSidebarState,
} from "./ui.js";

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
  lastUpdatedLabel: document.getElementById("lastUpdatedLabel"),
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

function toggleWeekLetterForTerm(termName) {
  if (!termName) return;
  const current = state.weekLetterMap[termName] || "A";
  state.weekLetterMap[termName] = current === "A" ? "B" : "A";
  saveWeekLetterPreferences();
}

function handleDeleteEvent(event) {
  dataStore
    .deleteEvent(event.id)
    .then(() => {
      refreshEvents();
      showToast(dom, "Event removed", "success");
    })
    .catch((error) => {
      console.error("Unable to remove event", error);
      showToast(dom, "Unable to remove event", "error");
    });
}

function refreshEvents() {
  if (!dataStore.db) return;
  dataStore
    .listEvents()
    .then(async (events) => {
      await migrateSyncMetadata(events);
      const sorted = events.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      state.events = sorted;
      render(state, dom, { onDeleteEvent: handleDeleteEvent });
    })
    .catch((error) => console.error("Unable to fetch events", error));
}

function openDB() {
  dataStore
    .open()
    .then(() => refreshEvents())
    .catch(() => console.error("Unable to open IndexedDB."));
}

function navigateByView(step) {
  if (state.viewMode === "term") {
    changeTerm(step);
  } else {
    addWorkingDays(step);
  }
}

function addWorkingDays(step) {
  const next = new Date(state.selectedDate);
  const direction = step >= 0 ? 1 : -1;
  do {
    next.setDate(next.getDate() + direction);
  } while (next.getDay() === 0 || next.getDay() === 6);
  state.selectedDate = next;
  render(state, dom, { onDeleteEvent: handleDeleteEvent });
}

function getTermGroupIndex() {
  const iso = toISO(state.selectedDate);
  const group = state.termGroups.find(
    (entry) => iso >= entry.startDate && iso <= entry.endDate
  );
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
    render(state, dom, { onDeleteEvent: handleDeleteEvent });
  }
}

function getSelectedTermGroup() {
  const iso = toISO(state.selectedDate);
  const group = state.termGroups.find(
    (entry) => iso >= entry.startDate && iso <= entry.endDate
  );
  return group || state.termGroups[0] || null;
}

function changeYear(step) {
  const next = new Date(state.selectedDate);
  next.setFullYear(next.getFullYear() + step);
  state.selectedDate = next;
  render(state, dom, { onDeleteEvent: handleDeleteEvent });
}

function importCalendarFile(file, button, input, sourceKey, origin, displayName) {
  if (!dataStore.db || !file) return;
  if (button) button.disabled = true;
  readFileAsText(file)
    .then((text) => {
      const rows = parseCSVRecords(text);
      const events = rows
        .map((row) => mapRowToEvent(row, sourceKey, origin))
        .filter((entry) => entry && entry.date && entry.title);
      return Promise.all(events.map((entry) => dataStore.saveEvent(entry))).then(() => events.length);
    })
    .then((count) => {
      refreshEvents();
      showToast(dom, `Imported ${count} ${displayName} entries.`, "success");
    })
    .catch((error) => {
      console.error("Import failed", error);
      showToast(dom, `Failed to import ${displayName} data.`, "error");
    })
    .finally(() => {
      if (button) button.disabled = false;
      if (input) input.value = "";
    });
}

function handleExportJSON() {
  if (!dataStore.db) return;
  dataStore
    .listEvents()
    .then((entries) => {
      if (!entries.length) {
        showToast(dom, "No events to export.", "info");
        return;
      }
      const fileName = `schoolcal-export-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJSON(fileName, entries);
      showToast(dom, "JSON export ready.", "success");
    })
    .catch((error) => {
      console.error("JSON export failed", error);
      showToast(dom, "JSON export failed.", "error");
    });
}

function handleImportJSON(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  readFileAsText(file)
    .then((text) => {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON payload must be an array.");
      }
      const events = parsed.map(normalizeImportedEvent).filter(Boolean);
      if (!events.length) {
        showToast(dom, "No valid records found in JSON.", "error");
        return;
      }
      return Promise.all(events.map((entry) => dataStore.saveEvent(entry))).then(() => events.length);
    })
    .then((count) => {
      if (count) {
        refreshEvents();
        showToast(dom, `${count} records imported.`, "success");
      }
    })
    .catch((error) => {
      console.error("JSON import failed", error);
      showToast(dom, "JSON import failed.", "error");
    })
    .finally(() => {
      fileInput.value = "";
    });
}

function bindUI() {
  document.querySelectorAll("[data-date-step]").forEach((button) => {
    button.addEventListener("click", () => navigateByView(Number(button.dataset.dateStep)));
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => changeYear(button.dataset.nav === "next" ? 1 : -1));
  });

  dom.datePicker.addEventListener("change", (event) => {
    const parsed = new Date(event.target.value);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      state.selectedDate = parsed;
      render(state, dom, { onDeleteEvent: handleDeleteEvent });
    }
  });

  dom.filterInput.addEventListener("input", (event) => {
    state.filter = event.target.value.trim();
    render(state, dom, { onDeleteEvent: handleDeleteEvent });
  });

  dom.clearFilter.addEventListener("click", () => {
    dom.filterInput.value = "";
    state.filter = "";
    render(state, dom, { onDeleteEvent: handleDeleteEvent });
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
      render(state, dom, { onDeleteEvent: handleDeleteEvent });
    });
  });

  dom.quickAddButton.addEventListener("click", () => {
    dom.modalOverlay.classList.add("active");
    dom.modalOverlay.setAttribute("aria-hidden", "false");
    dom.eventForm.reset();
    dom.eventForm.elements.date.value = toISO(state.selectedDate);
    clearModalError(dom);
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
    const result = validateEventForm(form);
    if (result.error) {
      showModalError(dom, result.error);
      return;
    }
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      title: result.title,
      date: result.date,
      subject: result.subject,
      notes: result.notes,
      color: result.color,
      createdAt: new Date().toISOString(),
      startDate: result.date,
      endDate: result.date,
      yearTags: [],
      origin: ORIGINS.PERSONAL,
      source: ORIGINS.PERSONAL,
      syncStatus: "local",
    };
    dataStore
      .saveEvent(record)
      .then(() => {
        hideModal();
        refreshEvents();
        showToast(dom, "Event saved", "success");
      })
      .catch((error) => {
        console.error("Unable to save event", error);
        showToast(dom, "Unable to save event", "error");
      });
  });

  document.querySelectorAll(".toggle").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".toggle").forEach((btn) => btn.classList.remove("selected"));
      button.classList.add("selected");
      const nextView = button.dataset.view;
      if (nextView) {
        state.viewMode = nextView;
        render(state, dom, { onDeleteEvent: handleDeleteEvent });
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

  dom.clearEventsButton?.addEventListener("click", async () => {
    if (!dataStore.db) return;
    if (!window.confirm("This will remove every local event. Continue?")) return;
    dom.clearEventsButton.disabled = true;
    try {
      await dataStore.clearAll();
      refreshEvents();
      showToast(dom, "All local events have been cleared.", "success");
    } catch (error) {
      console.error("Unable to clear events", error);
      showToast(dom, "Failed to clear events.", "error");
    } finally {
      dom.clearEventsButton.disabled = false;
    }
  });

  dom.weekLetterToggle?.addEventListener("click", () => {
    const group = getSelectedTermGroup();
    if (!group) return;
    toggleWeekLetterForTerm(group.termName);
    render(state, dom, { onDeleteEvent: handleDeleteEvent });
  });

  dom.exportJsonButton?.addEventListener("click", handleExportJSON);
  dom.importJsonButton?.addEventListener("click", () => {
    dom.jsonFileInput?.click();
  });

  dom.jsonFileInput?.addEventListener("change", () => {
    if (!dom.jsonFileInput) return;
    handleImportJSON(dom.jsonFileInput);
  });

  dom.sidebarToggle?.addEventListener("click", () => toggleSidebar(state, dom));
  updateSidebarState(state, dom);
}

function hideModal() {
  dom.modalOverlay.classList.remove("active");
  dom.modalOverlay.setAttribute("aria-hidden", "true");
  clearModalError(dom);
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
