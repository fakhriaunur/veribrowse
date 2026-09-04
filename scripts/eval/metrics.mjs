// scripts/eval/metrics.mjs
// M14 benchmark math — pure functions only (no I/O, no network, no env).
// Policy: fetch failures are EXCLUDED from agreement, never counted as
// misses. Only rows with a numeric trust and known tiers are included.

export const TIERS = ["safe", "caution", "risky"];

export const TIER_RANK = { risky: 0, caution: 1, safe: 2 };

function mean(values) {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

export function isIncluded(record) {
  if (!record || record.fetchFailed) return false;
  if (typeof record.trust !== "number" || !Number.isFinite(record.trust)) {
    return false;
  }
  return TIERS.includes(record.expected_tier) && TIERS.includes(record.level);
}

export function tierAgreement(records) {
  const included = records.filter(isIncluded);
  let matches = 0;
  for (const record of included) {
    if (record.expected_tier === record.level) matches += 1;
  }
  return {
    matches,
    total: included.length,
    agreement: included.length > 0 ? matches / included.length : null,
  };
}

export function confusionMatrix(records) {
  const matrix = {};
  for (const actual of TIERS) {
    matrix[actual] = {};
    for (const predicted of TIERS) matrix[actual][predicted] = 0;
  }
  let total = 0;
  for (const record of records.filter(isIncluded)) {
    matrix[record.expected_tier][record.level] += 1;
    total += 1;
  }
  return { matrix, total };
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function averageRanks(values) {
  const order = values.map((value, index) => ({ value, index }));
  order.sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) {
      j += 1;
    }
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs, ys) {
  if (xs.length < 2 || ys.length !== xs.length) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

export function trustTierCorrelation(records) {
  const included = records.filter(isIncluded);
  const trusts = included.map((record) => record.trust);
  const ranks = included.map((record) => TIER_RANK[record.expected_tier]);
  return {
    n: included.length,
    pearson: pearson(trusts, ranks),
    spearman: spearman(trusts, ranks),
  };
}

export function perTierCalibration(records) {
  const included = records.filter(isIncluded);
  const calibration = {};
  for (const tier of TIERS) {
    const tierRows = included.filter((record) => record.expected_tier === tier);
    const predicted = { safe: 0, caution: 0, risky: 0 };
    let matches = 0;
    for (const record of tierRows) {
      predicted[record.level] += 1;
      if (record.level === tier) matches += 1;
    }
    calibration[tier] = {
      n: tierRows.length,
      meanTrust: mean(tierRows.map((record) => record.trust)),
      agreementRate: tierRows.length > 0 ? matches / tierRows.length : null,
      predicted,
    };
  }
  return calibration;
}

export function failClosedRate(records) {
  const completed = records.filter(
    (record) =>
      typeof record.trust === "number" && Number.isFinite(record.trust),
  );
  const fallback = completed.filter((record) => record.llmStep == null);
  return {
    completed: completed.length,
    fallback: fallback.length,
    rate: completed.length > 0 ? fallback.length / completed.length : null,
  };
}

export function summarize(records) {
  const included = records.filter(isIncluded);
  return {
    total: records.length,
    included: included.length,
    excluded: records.length - included.length,
    agreement: tierAgreement(records),
    confusion: confusionMatrix(records),
    correlation: trustTierCorrelation(records),
    calibration: perTierCalibration(records),
    failClosed: failClosedRate(records),
  };
}
