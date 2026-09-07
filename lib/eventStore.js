import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, "..", "data", "events.json");
const RETENTION_DAYS = Number(process.env.EVENTS_RETENTION_DAYS || 30);

let writeChain = Promise.resolve();

function storePath() {
  return process.env.EVENTS_DATA_PATH || DEFAULT_PATH;
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return { events: {} };
    throw err;
  }
}

async function writeStore(data) {
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

function mergeEvent(existing, incoming) {
  const startedAt =
    existing.startedAt <= incoming.startedAt
      ? existing.startedAt
      : incoming.startedAt;

  let endedAt = existing.endedAt;
  if (incoming.endedAt) {
    endedAt = !endedAt || incoming.endedAt > endedAt ? incoming.endedAt : endedAt;
  }
  if (incoming.active) endedAt = null;

  return {
    ...existing,
    ...incoming,
    startedAt,
    endedAt,
    active: incoming.active,
    message: incoming.message || existing.message,
    updatedAt: new Date().toISOString(),
  };
}

function pruneEvents(eventsByChannel) {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const pruned = {};

  for (const [channelId, events] of Object.entries(eventsByChannel)) {
    const kept = events.filter((ev) => {
      const ref = ev.endedAt || ev.startedAt;
      return ref && Date.parse(ref) >= cutoff;
    });
    if (kept.length) pruned[channelId] = kept;
  }

  return pruned;
}

export async function upsertAlerts(channelId, normalizedAlerts) {
  writeChain = writeChain.then(async () => {
    const store = await readStore();
    const current = store.events[channelId] || [];
    const byId = new Map(current.map((ev) => [ev.id, ev]));

    for (const alert of normalizedAlerts) {
      const prev = byId.get(alert.id);
      byId.set(alert.id, prev ? mergeEvent(prev, alert) : { ...alert, updatedAt: new Date().toISOString() });
    }

    store.events[channelId] = [...byId.values()].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
    );
    store.events = pruneEvents(store.events);
    await writeStore(store);
  });

  return writeChain;
}

export async function listEvents(channelId, { limit = 50 } = {}) {
  await writeChain;
  const store = await readStore();
  const events = store.events[channelId] || [];
  return events.slice(0, limit);
}
