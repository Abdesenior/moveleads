/**
 * moverResearchIntel — pure aggregation + recommendation engine for
 * MoverResearchSubmission documents.
 *
 * Given an array of submission documents (typically lean()'d Mongoose docs),
 * returns the full intelligence payload consumed by the admin
 * /mover-research dashboard. All math is deterministic — no Date.now(),
 * no randomness — so the same input always produces the same output.
 *
 * Exports:
 *   computeIntel(submissions) -> intel payload
 */

const { deriveArchetypes } = require('./moverResearchTagger');

// ── small utilities ─────────────────────────────────────────────────────
function pct(n, total) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function asArr(v) {
  return Array.isArray(v) ? v : [];
}

function rank(map, total, limit) {
  const out = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, percent: pct(count, total) }));
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

function bumpSet(set, key) {
  if (!key) return;
  set.add(key);
}

// ── main entrypoint ─────────────────────────────────────────────────────
function computeIntel(submissions) {
  const docs = Array.isArray(submissions) ? submissions : [];
  const total = docs.length;

  // ── Funnel health ─────────────────────────────────────────────────────
  let completionSum = 0;
  let completionCount = 0;
  let screensSum = 0;
  let screensCount = 0;
  let firstSubmissionAt = null;
  let lastSubmissionAt = null;

  for (const d of docs) {
    if (typeof d.completionTimeSeconds === 'number' && d.completionTimeSeconds > 0) {
      completionSum += d.completionTimeSeconds;
      completionCount++;
    }
    if (typeof d.screensSeen === 'number' && d.screensSeen > 0) {
      screensSum += d.screensSeen;
      screensCount++;
    }
    const t = d.submittedAt ? new Date(d.submittedAt).getTime() : null;
    if (t) {
      if (firstSubmissionAt == null || t < firstSubmissionAt) firstSubmissionAt = t;
      if (lastSubmissionAt  == null || t > lastSubmissionAt)  lastSubmissionAt  = t;
    }
  }

  const funnel = {
    totalSubmissions: total,
    avgCompletionSeconds: completionCount ? Math.round(completionSum / completionCount) : 0,
    avgScreensSeen:       screensCount    ? Math.round((screensSum / screensCount) * 10) / 10 : 0,
    firstSubmissionAt: firstSubmissionAt ? new Date(firstSubmissionAt).toISOString() : null,
    lastSubmissionAt:  lastSubmissionAt  ? new Date(lastSubmissionAt).toISOString()  : null,
  };

  // ── Preferred request model ───────────────────────────────────────────
  const prefCounts = { exclusive: 0, shared: 0, depends: 0, unknown: 0 };
  for (const d of docs) {
    const v = d.sharedExclusivePreference;
    if (v === 'exclusive') prefCounts.exclusive++;
    else if (v === 'shared') prefCounts.shared++;
    else if (v === 'depends') prefCounts.depends++;
    else prefCounts.unknown++;
  }
  const preferredRequestModel = {
    exclusive: { count: prefCounts.exclusive, percent: pct(prefCounts.exclusive, total) },
    shared:    { count: prefCounts.shared,    percent: pct(prefCounts.shared,    total) },
    depends:   { count: prefCounts.depends,   percent: pct(prefCounts.depends,   total) },
    unknown:   { count: prefCounts.unknown,   percent: pct(prefCounts.unknown,   total) },
  };

  // ── Shared tolerance (only counts among "shared" + "depends" responses
  //    where sharedMaxMovers was actually answered; unknown captures the rest)
  const sharedToleranceCounts = { two: 0, three: 0, fourPlus: 0, unknown: 0 };
  for (const d of docs) {
    const v = d.sharedMaxMovers;
    if (v === '2 movers max')      sharedToleranceCounts.two++;
    else if (v === '3 movers max') sharedToleranceCounts.three++;
    else if (v === '4+ movers')    sharedToleranceCounts.fourPlus++;
    else                            sharedToleranceCounts.unknown++;
  }
  const sharedTolerance = {
    two:      { count: sharedToleranceCounts.two,      percent: pct(sharedToleranceCounts.two,      total) },
    three:    { count: sharedToleranceCounts.three,    percent: pct(sharedToleranceCounts.three,    total) },
    fourPlus: { count: sharedToleranceCounts.fourPlus, percent: pct(sharedToleranceCounts.fourPlus, total) },
    unknown:  { count: sharedToleranceCounts.unknown,  percent: pct(sharedToleranceCounts.unknown,  total) },
  };

  // ── Speed expectation ─────────────────────────────────────────────────
  const speedCounts = { '5min': 0, '15min': 0, '1hour': 0, sameday: 0, unknown: 0 };
  for (const d of docs) {
    const v = d.speedExpectation;
    if (v === '5min')        speedCounts['5min']++;
    else if (v === '15min')  speedCounts['15min']++;
    else if (v === '1hour')  speedCounts['1hour']++;
    else if (v === 'sameday') speedCounts.sameday++;
    else                      speedCounts.unknown++;
  }
  const speedExpectation = {
    '5min':   { count: speedCounts['5min'],  percent: pct(speedCounts['5min'],  total) },
    '15min':  { count: speedCounts['15min'], percent: pct(speedCounts['15min'], total) },
    '1hour':  { count: speedCounts['1hour'], percent: pct(speedCounts['1hour'], total) },
    'sameday':{ count: speedCounts.sameday,  percent: pct(speedCounts.sameday,  total) },
    unknown:  { count: speedCounts.unknown,  percent: pct(speedCounts.unknown,  total) },
  };

  // ── Top valuable traits (valueSignals + exclusiveTriggers +
  //    exclusiveTriggersDepends, deduped per submission) ─────────────────
  const valuableTraits = new Map();
  for (const d of docs) {
    const seen = new Set();
    for (const v of asArr(d.valueSignals)) bumpSet(seen, v);
    for (const v of asArr(d.exclusiveTriggers)) bumpSet(seen, v);
    for (const v of asArr(d.exclusiveTriggersDepends)) bumpSet(seen, v);
    for (const v of seen) valuableTraits.set(v, (valuableTraits.get(v) || 0) + 1);
  }
  const topValuableTraits = rank(valuableTraits, total, 10);

  // ── Top trust killers (overpricedSignals + leadProviderFrustrations) ──
  const trustKillers = new Map();
  for (const d of docs) {
    const seen = new Set();
    for (const v of asArr(d.overpricedSignals)) bumpSet(seen, v);
    for (const v of asArr(d.leadProviderFrustrations)) bumpSet(seen, v);
    for (const v of seen) trustKillers.set(v, (trustKillers.get(v) || 0) + 1);
  }
  const topTrustKillers = rank(trustKillers, total, 10);

  // ── Top retention drivers ─────────────────────────────────────────────
  const retentionMap = new Map();
  for (const d of docs) {
    const seen = new Set(asArr(d.retentionDrivers));
    for (const v of seen) retentionMap.set(v, (retentionMap.get(v) || 0) + 1);
  }
  const topRetentionDrivers = rank(retentionMap, total, 10);

  // ── Archetypes ────────────────────────────────────────────────────────
  const archetypeKeys = [
    'exclusive_first',
    'shared_volume',
    'long_distance_focused',
    'commercial_focused',
    'speed_sensitive',
    'quality_sensitive',
    'price_sensitive',
    'local_focus',
  ];
  const archetypeCounts = Object.fromEntries(archetypeKeys.map(k => [k, 0]));
  for (const d of docs) {
    const tags = deriveArchetypes(d);
    for (const t of tags) {
      if (archetypeCounts[t] != null) archetypeCounts[t]++;
    }
  }
  const archetypes = {};
  for (const k of archetypeKeys) {
    archetypes[k] = { count: archetypeCounts[k], percent: pct(archetypeCounts[k], total) };
  }

  // ── State breakdown ───────────────────────────────────────────────────
  const stateMap = new Map(); // state -> bucket
  for (const d of docs) {
    const st = (d.mainStateOrMarket || '').trim();
    if (!st) continue;
    if (!stateMap.has(st)) {
      stateMap.set(st, {
        state: st,
        count: 0,
        valuableTraits: new Map(),
        trustKillers: new Map(),
        archetypes: Object.fromEntries(archetypeKeys.map(k => [k, 0])),
        sharedTolerance: { '2 movers max': 0, '3 movers max': 0, '4+ movers': 0 },
        speedExpectation: { '5min': 0, '15min': 0, '1hour': 0, sameday: 0 },
        preferredRequestModel: { exclusive: 0, shared: 0, depends: 0 },
      });
    }
    const bucket = stateMap.get(st);
    bucket.count++;

    const vSeen = new Set();
    for (const v of asArr(d.valueSignals)) bumpSet(vSeen, v);
    for (const v of asArr(d.exclusiveTriggers)) bumpSet(vSeen, v);
    for (const v of asArr(d.exclusiveTriggersDepends)) bumpSet(vSeen, v);
    for (const v of vSeen) bucket.valuableTraits.set(v, (bucket.valuableTraits.get(v) || 0) + 1);

    const kSeen = new Set();
    for (const v of asArr(d.overpricedSignals)) bumpSet(kSeen, v);
    for (const v of asArr(d.leadProviderFrustrations)) bumpSet(kSeen, v);
    for (const v of kSeen) bucket.trustKillers.set(v, (bucket.trustKillers.get(v) || 0) + 1);

    for (const a of deriveArchetypes(d)) {
      if (bucket.archetypes[a] != null) bucket.archetypes[a]++;
    }

    if (d.sharedMaxMovers && bucket.sharedTolerance[d.sharedMaxMovers] != null) {
      bucket.sharedTolerance[d.sharedMaxMovers]++;
    }
    if (d.speedExpectation && bucket.speedExpectation[d.speedExpectation] != null) {
      bucket.speedExpectation[d.speedExpectation]++;
    }
    if (d.sharedExclusivePreference && bucket.preferredRequestModel[d.sharedExclusivePreference] != null) {
      bucket.preferredRequestModel[d.sharedExclusivePreference]++;
    }
  }

  const stateBreakdown = Array.from(stateMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((b) => {
      const topVT = Array.from(b.valuableTraits.entries()).sort((a, c) => c[1] - a[1])[0];
      const topTK = Array.from(b.trustKillers.entries()).sort((a, c) => c[1] - a[1])[0];
      const topArch = Object.entries(b.archetypes).sort((a, c) => c[1] - a[1])[0];
      return {
        state: b.state,
        count: b.count,
        percent: pct(b.count, total),
        topArchetype: topArch && topArch[1] > 0
          ? { key: topArch[0], percent: pct(topArch[1], b.count) }
          : null,
        topValuableTrait: topVT
          ? { label: topVT[0], percent: pct(topVT[1], b.count) }
          : null,
        topTrustKiller: topTK
          ? { label: topTK[0], percent: pct(topTK[1], b.count) }
          : null,
        sharedTolerance: b.sharedTolerance,
        speedExpectation: b.speedExpectation,
        preferredRequestModel: b.preferredRequestModel,
      };
    });

  // ── Recommendations (rule-based) ──────────────────────────────────────
  const recommendations = [];
  const severityRank = { high: 0, medium: 1, low: 2 };

  // cap_shared_2 — > 50% prefer 2 movers max
  if (sharedTolerance.two.percent > 50) {
    recommendations.push({
      id: 'cap_shared_2',
      severity: 'high',
      message: `Cap shared requests at 2 movers — ${sharedTolerance.two.percent}% of founding movers prefer it.`,
    });
  }

  // long_distance_exclusive — "Long-distance moves" in top 3 of exclusiveTriggers
  // AND its share > 60%. We compute exclusiveTriggers-only counts here.
  const etMap = new Map();
  for (const d of docs) {
    const seen = new Set(asArr(d.exclusiveTriggers));
    for (const v of seen) etMap.set(v, (etMap.get(v) || 0) + 1);
  }
  const etRanked = rank(etMap, total);
  const ldIdx = etRanked.findIndex(r => r.label === 'Long-distance moves');
  if (ldIdx >= 0 && ldIdx < 3 && etRanked[ldIdx].percent > 60) {
    recommendations.push({
      id: 'long_distance_exclusive',
      severity: 'high',
      message: `Long-distance requests should default to exclusive — ${etRanked[ldIdx].percent}% preference.`,
    });
  }

  // five_min_sla
  if (speedExpectation['5min'].percent > 30) {
    recommendations.push({
      id: 'five_min_sla',
      severity: 'high',
      message: `Build the 5-minute SLA. Speed-sensitive majority — ${speedExpectation['5min'].percent}%.`,
    });
  }

  // phone_pickup_priority
  const topVT = topValuableTraits[0];
  const topTK = topTrustKillers[0];
  const wantsPhone = topVT && topVT.label === 'Customer answers the phone';
  const hatesNoAnswer = topTK && (
    topTK.label === "Customer doesn't answer" ||
    topTK.label === "Customer doesn’t answer" ||
    topTK.label === 'Customer does not answer'
  );
  if (wantsPhone && hatesNoAnswer) {
    recommendations.push({
      id: 'phone_pickup_priority',
      severity: 'high',
      message: 'Phone-pickup verification is the highest-leverage feature — #1 want AND #1 trust killer.',
    });
  }

  // stop_overbroadcasting
  const overbroadcastLabels = new Set([
    'Too many movers received it',
    'Requests sent to too many movers',
    'Sent to too many movers',
  ]);
  if (topTK && overbroadcastLabels.has(topTK.label)) {
    recommendations.push({
      id: 'stop_overbroadcasting',
      severity: 'high',
      message: `Stop over-broadcasting. Biggest single trust killer — ${topTK.percent}%.`,
    });
  }

  // refund_retention_lever
  if (archetypes.price_sensitive.percent > 30) {
    recommendations.push({
      id: 'refund_retention_lever',
      severity: 'medium',
      message: `Refund UX is a retention lever — ${archetypes.price_sensitive.percent}% are price-sensitive.`,
    });
  }

  // commercial_segment
  if (archetypes.commercial_focused.percent > 15) {
    recommendations.push({
      id: 'commercial_segment',
      severity: 'medium',
      message: `Commercial segment is meaningful — ${archetypes.commercial_focused.percent}% of founding movers focus on offices/commercial.`,
    });
  }

  // quality_over_price
  const topRD = topRetentionDrivers[0];
  const fairPricing = topRetentionDrivers.find(t => t.label === 'Fair pricing');
  if (topRD && topRD.label !== 'Fair pricing' && fairPricing && fairPricing.percent < 50) {
    recommendations.push({
      id: 'quality_over_price',
      severity: 'medium',
      message: `Quality beats price. "${topRD.label}" outranks fair pricing.`,
    });
  }

  recommendations.sort((a, b) => {
    const sa = severityRank[a.severity] ?? 99;
    const sb = severityRank[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  return {
    funnel,
    preferredRequestModel,
    sharedTolerance,
    speedExpectation,
    topValuableTraits,
    topTrustKillers,
    topRetentionDrivers,
    archetypes,
    stateBreakdown,
    recommendations,
  };
}

module.exports = { computeIntel };
