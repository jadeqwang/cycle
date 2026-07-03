// Pure sync logic. All dates are 'YYYY-MM-DD' strings here (lexicographic
// order == chronological order); Date objects never cross this boundary.

const DAY_MS = 86400000;

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function eventKind(event) {
  return (event.summary || '').trim().toLowerCase();
}

function sortByDate(a, b) {
  if (a.date === b.date) return 0;
  return a.date < b.date ? -1 : 1;
}

function sortPeriods(a, b) {
  if (a.start === b.start) return 0;
  return a.start < b.start ? -1 : 1;
}

export function pairRemoteEvents(events, todayStr) {
  const usable = events
    .filter(event => event.date <= todayStr)
    .filter(event => ['period start', 'period end'].includes(eventKind(event)));
  const starts = usable
    .filter(event => eventKind(event) === 'period start')
    .sort(sortByDate);
  const ends = usable
    .filter(event => eventKind(event) === 'period end')
    .sort(sortByDate);
  const usedEnds = new Set();

  return starts.map((start, i) => {
    const nextStart = starts[i + 1]?.date ?? '9999-12-31';
    const end = ends.find(candidate => (
      !usedEnds.has(candidate.id)
      && candidate.date >= start.date
      && candidate.date < nextStart
      && daysBetween(start.date, candidate.date) <= 14
    ));

    if (end) usedEnds.add(end.id);

    return {
      start: start.date,
      end: end ? end.date : null,
      startEventId: start.id,
      endEventId: end ? end.id : null,
      updated: start.updated,
    };
  });
}

export function planSync({ local, remote, deletedEventIds, timeMin }) {
  const plan = {
    pushCreates: [],
    pushUpdates: [],
    pushDeletes: [],
    localPeriods: [],
    clearedTombstones: [...deletedEventIds],
  };
  const tombstones = new Set(deletedEventIds);
  const byId = new Map(remote.map(entry => [entry.startEventId, entry]));
  const byDate = new Map(remote.map(entry => [entry.start, entry]));
  const claimed = new Set();

  for (const entry of local) {
    const localEntry = { ...entry };
    let remoteEntry = localEntry.startEventId ? byId.get(localEntry.startEventId) : null;
    if (!remoteEntry && !localEntry.startEventId) {
      const candidate = byDate.get(localEntry.start);
      if (candidate && !claimed.has(candidate.startEventId)) remoteEntry = candidate;
    }

    if (remoteEntry) {
      claimed.add(remoteEntry.startEventId);
      const localNewer = localEntry.updatedAt > remoteEntry.updated;
      localEntry.startEventId = remoteEntry.startEventId;

      if (localEntry.start !== remoteEntry.start) {
        if (localNewer) {
          plan.pushUpdates.push({ eventId: remoteEntry.startEventId, date: localEntry.start });
        } else {
          localEntry.start = remoteEntry.start;
          localEntry.updatedAt = remoteEntry.updated;
        }
      }

      if (remoteEntry.end && !localEntry.end) {
        localEntry.end = remoteEntry.end;
        localEntry.endEventId = remoteEntry.endEventId;
      } else if (remoteEntry.end && localEntry.end) {
        localEntry.endEventId = localEntry.endEventId || remoteEntry.endEventId;
        if (localEntry.end !== remoteEntry.end) {
          if (localNewer) {
            plan.pushUpdates.push({ eventId: remoteEntry.endEventId, date: localEntry.end });
          } else {
            localEntry.end = remoteEntry.end;
          }
        }
      } else if (!remoteEntry.end && localEntry.end) {
        if (localEntry.endEventId) {
          localEntry.end = null;
          localEntry.endEventId = null;
        } else {
          plan.pushCreates.push({ kind: 'end', date: localEntry.end, localStart: localEntry.start });
        }
      }

      plan.localPeriods.push(localEntry);
    } else if (localEntry.startEventId) {
      if (localEntry.start < timeMin) {
        plan.localPeriods.push(localEntry);
        continue;
      }
      if (localEntry.endEventId) plan.pushDeletes.push(localEntry.endEventId);
    } else {
      plan.pushCreates.push({ kind: 'start', date: localEntry.start, localStart: localEntry.start });
      if (localEntry.end) plan.pushCreates.push({ kind: 'end', date: localEntry.end, localStart: localEntry.start });
      plan.localPeriods.push(localEntry);
    }
  }

  for (const remoteEntry of remote) {
    if (claimed.has(remoteEntry.startEventId)) continue;
    if (tombstones.has(remoteEntry.startEventId)) {
      plan.pushDeletes.push(remoteEntry.startEventId);
      if (remoteEntry.endEventId) plan.pushDeletes.push(remoteEntry.endEventId);
      continue;
    }
    plan.localPeriods.push({
      start: remoteEntry.start,
      end: remoteEntry.end,
      startEventId: remoteEntry.startEventId,
      endEventId: remoteEntry.endEventId,
      updatedAt: remoteEntry.updated,
    });
  }

  plan.localPeriods.sort(sortPeriods);
  return plan;
}
