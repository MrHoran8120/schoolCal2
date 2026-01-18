import {
  toLocaleLabel,
  toEventHeading,
  toISO,
  formatTimeAgo,
  getLatestLastModified,
  generateWeekDays,
  parseISODate,
} from "./utils.js";

const SYNC_STATUS = {
  local: { label: "Local", className: "sync-local" },
  synced: { label: "Synced", className: "sync-synced" },
  conflict: { label: "Conflict", className: "sync-conflict" },
};

function getSyncBadgeInfo(status) {
  const key = (status || "local").toLowerCase();
  return SYNC_STATUS[key] || SYNC_STATUS.local;
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

function parseTermName(title) {
  const match = title?.match(/(Term\s*\d+)/i);
  return match ? match[1] : "Term";
}

function parseWeekLabel(title) {
  const match = title?.match(/Week\s*(\d+)/i);
  return match ? `Week ${match[1]}` : "Week";
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

function ensureWeekGroups(state) {
  const weeks = buildTermWeeks(state.events);
  const groups = buildTermGroups(weeks);
  state.termWeeks = weeks;
  state.termGroups = groups;
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

function getSelectedTermGroup(state) {
  const iso = toISO(state.selectedDate);
  const group = state.termGroups.find(
    (entry) => iso >= entry.startDate && iso <= entry.endDate
  );
  return group || state.termGroups[0] || null;
}

function getWeekLetter(state, termName, weekIndex) {
  if (!termName) return "A";
  const startLetter = state.weekLetterMap[termName] || "A";
  const offset = startLetter === "B" ? 1 : 0;
  const parity = (weekIndex + offset) % 2;
  return parity === 0 ? "A" : "B";
}

function eventMatchesFilter(event, filter, yearFilters) {
  const text = (filter || "").trim().toLowerCase();
  const textMatch =
    !text ||
    event.title.toLowerCase().includes(text) ||
    (event.subject && event.subject.toLowerCase().includes(text)) ||
    (event.notes && event.notes.toLowerCase().includes(text));
  return textMatch && matchesYearFilters(event, yearFilters);
}

function matchesYearFilters(event, yearFilters) {
  if (!yearFilters?.size) return true;
  const entries = Array.from(yearFilters);
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

function updateLastUpdatedLabel(state, dom) {
  if (!dom.lastUpdatedLabel) return;
  const latest = getLatestLastModified(state.events);
  if (!latest) {
    dom.lastUpdatedLabel.textContent = "Last updated: —";
    return;
  }
  dom.lastUpdatedLabel.textContent = `Last updated: ${formatTimeAgo(latest)}`;
}

function renderTermView(state, dom, group) {
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
    (entry) => entry.type !== "term" && eventMatchesFilter(entry, state.filter, state.yearFilters)
  );
  const eventsByDate = groupEventsByDate(filteredEventsForTerm);

  weeksToShow.forEach((week, index) => {
    const weekSection = document.createElement("article");
    weekSection.className = "term-week";

    const header = document.createElement("div");
    header.className = "term-week-header";
    const letter = group ? getWeekLetter(state, group.termName, index) : "A";
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
          const syncInfo = getSyncBadgeInfo(event.syncStatus);
          item.innerHTML = `
            <div class="term-day-event-heading">
              <span class="term-day-event-title">${event.title}</span>
              <span class="term-day-event-sync ${syncInfo.className}">${syncInfo.label}</span>
            </div>
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
export function render(state, dom, callbacks = {}) {
  const dateString = toLocaleLabel(state.selectedDate);
  dom.yearDisplay.textContent = state.selectedDate.getFullYear();
  dom.selectedDateLabel.textContent = dateString;
  dom.eventDateHeading.textContent = toEventHeading(state.selectedDate);
  dom.datePicker.value = toISO(state.selectedDate);

  const targeted = state.events.filter(
    (entry) =>
      entry.type !== "term" &&
      entry.date === toISO(state.selectedDate) &&
      eventMatchesFilter(entry, state.filter, state.yearFilters)
  );

  dom.eventCount.textContent = `${targeted.length} events`;

  ensureWeekGroups(state);
  const group = getSelectedTermGroup(state);
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
    renderTermView(state, dom, group);
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
  } else {
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
      const syncBadge = document.createElement("span");
      const badgeInfo = getSyncBadgeInfo(event.syncStatus);
      syncBadge.className = `event-sync-badge ${badgeInfo.className}`;
      syncBadge.textContent = badgeInfo.label;
      const notes = document.createElement("p");
      notes.style.margin = "6px 0 0";
      notes.style.color = "var(--muted)";
      notes.textContent = event.notes ? event.notes : "Tap to add more context.";

      text.append(title, meta, notes);
      text.append(syncBadge);

      const deleteButton = document.createElement("button");
      deleteButton.textContent = "dY-`";
      deleteButton.title = "Remove event";
      deleteButton.addEventListener("click", () => {
        if (!window.confirm("Remove this event?")) return;
        if (typeof callbacks.onDeleteEvent === "function") {
          callbacks.onDeleteEvent(event);
        }
      });

      card.append(text, deleteButton);
      dom.eventList.appendChild(card);
    });
  }

  updateLastUpdatedLabel(state, dom);
}

export function showToast(dom, message, variant = "info", duration = 3200) {
  if (!dom?.toastContainer || !message) return;
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

export function showModalError(dom, message) {
  if (!dom?.modalErrorMessage) return;
  dom.modalErrorMessage.textContent = message || "";
}

export function clearModalError(dom) {
  showModalError(dom, "");
}

export function toggleSidebar(state, dom) {
  state.isSidebarHidden = !state.isSidebarHidden;
  updateSidebarState(state, dom);
}

export function updateSidebarState(state, dom) {
  const collapsed = state.isSidebarHidden;
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  if (dom.sidebarToggle) {
    dom.sidebarToggle.setAttribute("aria-expanded", (!collapsed).toString());
  }
}
