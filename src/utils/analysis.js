import { diffDays, genDays } from './dates.js';

// ── Per-cycle metrics ──────────────────────────────────────

export function getCycleLength(cycle) {
  const dates = Object.keys(cycle.obs || {}).sort();
  if (!dates.length) return null;
  const first = dates[0];
  const last  = dates[dates.length - 1];
  return diffDays(first, last) + 1;
}

export function getApiceDay(cycle) {
  const days = genDays(cycle.start, cycle.obs);
  const found = days.find(d => d.obs?.stamp === 'apice');
  return found ? found.n : null;
}

export function getLutealPhase(cycle, nextCycleStart) {
  const apiceDay = getApiceDay(cycle);
  if (!apiceDay || !nextCycleStart) return null;
  const apiceDate = Object.entries(cycle.obs || {})
    .find(([, o]) => o.stamp === 'apice')?.[0];
  if (!apiceDate) return null;
  // Luteal phase = day after ápice to day before next menses (inclusive)
  return diffDays(apiceDate, nextCycleStart) - 1;
}

export function getPrePeakPhase(cycle) {
  const apiceDay = getApiceDay(cycle);
  if (!apiceDay) return null;
  const days = genDays(cycle.start, cycle.obs);
  // Pre-peak = days 1..ápice, minus menstruação days
  const firstNonBleeding = days.find(d => d.obs && d.obs.stamp !== 'sangramento');
  if (!firstNonBleeding) return null;
  return apiceDay - firstNonBleeding.n + 1;
}

export function getBIPDescriptor(cycle) {
  // Identify the PBI segment: consecutive 'seco' days before first muco/apice
  const days = genDays(cycle.start, cycle.obs);
  const bipDays = [];
  let reachedMucus = false;
  for (const d of days) {
    if (!d.obs) continue;
    if (d.obs.stamp === 'sangramento') { bipDays.length = 0; continue; }
    if (d.obs.stamp === 'seco') { if (!reachedMucus) bipDays.push(d); }
    if (d.obs.stamp === 'muco' || d.obs.stamp === 'apice') { reachedMucus = true; }
  }
  if (!bipDays.length) return null;
  return bipDays[0].obs.mucus || 'seco';
}

// ── Neutral variability helpers ────────────────────────────

/**
 * Compute the population standard deviation of cycle lengths.
 * Neutral arithmetic on recorded facts — no clinical interpretation.
 *
 * @param {Array} cycles - Array of cycle objects with {start, obs}
 * @returns {number|null} Std dev rounded to 1 decimal, or null if < 2 valid lengths
 */
export function getCycleLengthStdDev(cycles) {
  if (!cycles || cycles.length < 2) return null;
  const lengths = cycles.map(getCycleLength).filter((l) => l !== null);
  if (lengths.length < 2) return null;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Extract per-cycle lengths for the historical trend chart.
 * Returns only cycles with a computable length (skips empty obs).
 *
 * @param {Array} cycles - Array of cycle objects with {start, obs}
 * @returns {Array<{index: number, length: number}>}
 */
export function getCycleLengthsForTrend(cycles) {
  if (!cycles || !cycles.length) return [];
  const result = [];
  for (let i = 0; i < cycles.length; i++) {
    const len = getCycleLength(cycles[i]);
    if (len !== null) result.push({ index: i + 1, length: len });
  }
  return result;
}

// ── Multi-cycle stats ──────────────────────────────────────

export function computeMultiCycleStats(currentCycle, history) {
  // Build array of all cycles with enough data
  const allCycles = [...history, currentCycle].filter(c => Object.keys(c.obs || {}).length >= 5);
  const recent = allCycles.slice(-6); // last 6 cycles

  if (recent.length < 1) return null;

  const lengths = recent.map(getCycleLength).filter(Boolean);
  const apiceDays = recent.map(getApiceDay).filter(Boolean);

  // Luteal phase: need next cycle start to compute
  const lutealList = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const lp = getLutealPhase(recent[i], recent[i + 1].start);
    if (lp !== null && lp > 0) lutealList.push(lp);
  }

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mean = arr => arr.length ? Math.round(avg(arr) * 10) / 10 : null;

  // BIP 3-cycle rule
  const last3 = recent.slice(-3).filter(c => getApiceDay(c) !== null);
  const bipDescriptors = last3.map(getBIPDescriptor);
  const bipConfirmed = last3.length === 3 &&
    bipDescriptors.every(b => b !== null) &&
    bipDescriptors.every(b => b === bipDescriptors[0]);

  const flags = detectFlags({
    lengths,
    lutealList,
    apiceDays,
    recentCount: recent.length,
    bipConfirmed,
    last3HasPeak: last3.length,
  });

  return {
    cycleCount: recent.length,
    avgLength:  mean(lengths),
    minLength:  lengths.length ? Math.min(...lengths) : null,
    maxLength:  lengths.length ? Math.max(...lengths) : null,
    stdDevLength: getCycleLengthStdDev(recent),
    cycleLengths: getCycleLengthsForTrend(recent),
    avgApice:   mean(apiceDays),
    minApice:   apiceDays.length ? Math.min(...apiceDays) : null,
    maxApice:   apiceDays.length ? Math.max(...apiceDays) : null,
    avgLuteal:  mean(lutealList),
    minLuteal:  lutealList.length ? Math.min(...lutealList) : null,
    maxLuteal:  lutealList.length ? Math.max(...lutealList) : null,
    bipConfirmed,
    bipDescriptors,
    flags,
  };
}

// ── Anomaly detection (clinical Portuguese, instrutora tone) ──

function detectFlags({ lengths, lutealList, apiceDays, recentCount, bipConfirmed, last3HasPeak }) {
  const flags = [];

  for (const l of lengths) {
    if (l < 21) {
      flags.push({ level: 'atenção', msg: `Ciclo curto detectado (${l} dias). Recomendamos revisar com sua instrutora.` });
      break;
    }
    if (l > 35) {
      flags.push({ level: 'informação', msg: `Ciclo longo detectado (${l} dias). Pode ser variação normal em situações de estresse, amamentação ou pré-menopausa. Comente com sua instrutora.` });
      break;
    }
  }

  for (const lp of lutealList) {
    if (lp < 11) {
      flags.push({ level: 'atenção', msg: `Fase pós-Ápice mais curta que o habitual (${lp} dias). O intervalo esperado é de 11 a 16 dias. Sugerimos revisão com sua instrutora.` });
      break;
    }
    if (lp > 16) {
      flags.push({ level: 'informação', msg: `Fase pós-Ápice prolongada (${lp} dias). Se não houve menstruação, considere realizar um teste de gravidez.` });
      break;
    }
  }

  if (apiceDays.length === 0 && recentCount >= 1) {
    flags.push({ level: 'atenção', msg: 'Ápice não identificado nos ciclos registrados. Em algumas situações (amamentação, pós-uso de contraceptivo, estresse), a ovulação pode atrasar ou não ocorrer. Continue anotando e consulte sua instrutora.' });
  } else if (apiceDays.length < recentCount - 1 && recentCount >= 2) {
    flags.push({ level: 'informação', msg: 'Ápice não identificado em um ou mais ciclos. Continue observando e registrando regularmente.' });
  }

  if (!bipConfirmed && last3HasPeak === 3) {
    flags.push({ level: 'informação', msg: 'Padrão Básico de Infertilidade (PBI) ainda em confirmação. São necessários 3 ciclos seguidos de menos de 35 dias com padrão inalterado para confirmar o PBI.' });
  }

  if (!flags.length) {
    flags.push({ level: 'ok', msg: 'Padrão dentro do intervalo esperado. Continue anotando regularmente e mantenha contato com sua instrutora.' });
  }

  return flags;
}
