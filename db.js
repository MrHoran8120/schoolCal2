import { getCurrentTimestamp } from "./utils.js";

export const dataStore = {
  db: null,
  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("schoolcal-db", 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "id" });
        }
      };
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  },
  ensureDB() {
    if (!this.db) {
      throw new Error("Database is not initialized.");
    }
  },
  transaction(mode = "readonly") {
    this.ensureDB();
    const tx = this.db.transaction("events", mode);
    return tx.objectStore("events");
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
    record.lastModified = getCurrentTimestamp();
    if (!record.syncStatus) {
      record.syncStatus = "local";
    }
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

function ensureSyncMetadata(entry) {
  let needsUpdate = false;
  if (!entry.syncStatus) {
    entry.syncStatus = "local";
    needsUpdate = true;
  }
  if (!entry.lastModified) {
    entry.lastModified = getCurrentTimestamp();
    needsUpdate = true;
  }
  return needsUpdate;
}

function handlePotentialConflicts(events) {
  // TODO: replace this with true conflict detection once a backend sync is in place.
  if (!Array.isArray(events)) return;
  events.forEach((entry) => {
    if (entry.syncStatus === "conflict") {
      // placeholder for future conflict UI hooks
    }
  });
}

export async function migrateSyncMetadata(events) {
  const pending = [];
  if (!Array.isArray(events)) return;
  events.forEach((entry) => {
    if (ensureSyncMetadata(entry)) {
      pending.push(entry);
    }
  });
  handlePotentialConflicts(events);
  if (!pending.length) return;
  await Promise.all(pending.map((entry) => dataStore.saveEvent(entry)));
}
