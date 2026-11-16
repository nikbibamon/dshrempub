'use strict';
const {validateEvent,SCALE,LEVELS,TRUTH,EXPOSURE,MODEL_REV}=require('./learn-schema');
const {canonicalJson}=require('./learn-candidate');
const contentOf = (ev) => { const { event_id, seq, ts, client, ...rest } = ev; return canonicalJson(rest); };   // what event_id hashes
function derive(events, scale = SCALE, opts = {}) {
  if (!Array.isArray(events)) throw new TypeError('derive: events must be an array of parsed journal lines (null for an unreadable line)');
  const truth = opts.truth || {}, ctx = opts.ctx || null, wantInstance = opts.instance || null;
  const foreign = new Set(), instances = [];
  const seen = new Map(), ignored = [], candidates = new Map(), exposure = new Map(), gapCandidates = new Set();
  const gapAt = []; let lastSeq = null, idx = -1;
  const checks = [], terminal = new Map(), seenObs = new Set(), rows = [];
  const credited = new Map(), creditedIndependent = new Map();
  let total = 0;
  const isCredited = (c) => c.initiator === 'learner' && c.bound === true && scale.credited.has(c.kind) && ['pass', 'fail'].includes(c.result);
  // A gap is a POSITION in the walk: a decision/check is unknown if a gap lies after its candidate was presented.
  const gapBetween = (fromIdx, toIdx) => gapAt.some((g) => g > fromIdx && g <= toIdx);
  const truthOf = (cid) => { const c = candidates.get(cid); return c && Object.hasOwn(truth, c.task_id) ? truth[c.task_id] : undefined; };
  const scorable = (cid) => { const c = candidates.get(cid); return !!c && !c.conflict && c.context === 'exercise' && c.observer_ok !== false && TRUTH.includes(truthOf(cid)) && !gapCandidates.has(cid); };

  for (const raw of events) {
    idx++;
    // A line that is not an object (JSON null/number/string/array, or an unparsable line passed as null) cannot be an event, but it
    // may have been a real check: it occupies its position and closes observation. No field is read before this guard.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) { ignored.push({ event_id: null, why: 'invalid_event:schema_invalid' }); gapAt.push(idx); continue; }
    const ev = raw;
    // A replayed duplicate line (same event_id) does not move the sequence; an invalid line still occupies its slot.
    const dupId = ev.type !== 'observation_gap' && seen.has(ev.event_id);          // a gap marker is never a "duplicate": each occurrence has its own position
    if (Number.isInteger(ev.seq)) {
      if (!dupId) { if (lastSeq !== null && ev.seq !== lastSeq + 1) gapAt.push(idx); lastSeq = ev.seq; }
      else if (lastSeq !== null && ev.seq > lastSeq) { if (ev.seq !== lastSeq + 1) gapAt.push(idx); lastSeq = ev.seq; }   // an exact duplicate ahead of the counter: next number = fine, a jump = gap
      // a duplicate whose seq is <= the last one is a replayed copy of an old line: it does not move the counter
    }
    const errs = validateEvent(ev, ctx);
    // Fail-closed: a line that cannot be read as an event may have been a real check. Its POSITION closes observation
    // (decisions after it, for candidates presented before it, are unknown) instead of reading as "no check was run".
    if (errs.length) { ignored.push({ event_id: ev.event_id, why: 'invalid_event:' + errs[0] }); gapAt.push(idx); continue; }
    const body = contentOf(ev);
    if (dupId) {
      if (seen.get(ev.event_id) === body) { ignored.push({ event_id: ev.event_id, why: 'duplicate_event' }); continue; }       // an identical replay
      // The journal refuses this on append (`event_conflict`). In a damaged or merged file the line may have been a real check: close observation.
      ignored.push({ event_id: ev.event_id, why: 'event_conflict' }); gapAt.push(idx); continue;
    }
    seen.set(ev.event_id, body);

    // Another instance (only when one is requested): not part of this score, and its lines do not close this instance's observation.
    if (ev.type !== 'candidate_presented' && foreign.has(ev.candidate_id)) { ignored.push({ event_id: ev.event_id, why: 'other_instance' }); continue; }
    if (ev.type === 'candidate_presented') {
      if (!instances.includes(ev.exercise_instance)) instances.push(ev.exercise_instance);
      const prev = candidates.get(ev.candidate_id);
      if (!prev && (foreign.has(ev.candidate_id) || (wantInstance && ev.exercise_instance !== wantInstance))) { foreign.add(ev.candidate_id); ignored.push({ event_id: ev.event_id, why: 'other_instance' }); continue; }
      if (!prev) candidates.set(ev.candidate_id, { ...ev, idx });
      else if (canonicalJson({ ...prev, event_id: 0, seq: 0, ts: 0, idx: 0, conflict: 0 }) !== canonicalJson({ ...ev, event_id: 0, seq: 0, ts: 0, idx: 0, conflict: 0 })) { prev.conflict = true; ignored.push({ event_id: ev.event_id, why: 'presented_conflict' }); gapAt.push(idx); }
      else ignored.push({ event_id: ev.event_id, why: 'repeat_presented' });
    } else if (ev.type === 'exposure') {
      if (!candidates.has(ev.candidate_id)) { ignored.push({ event_id: ev.event_id, why: 'unanchored_exposure' }); gapAt.push(idx); continue; }
      exposure.set(ev.candidate_id, Math.max(exposure.get(ev.candidate_id) || 0, EXPOSURE[ev.level]));
    } else if (ev.type === 'observation_gap') {
      if (ev.candidate_id) gapCandidates.add(ev.candidate_id); else gapAt.push(idx);
    } else if (ev.type === 'check') {
      const cand = candidates.get(ev.candidate_id);
      const treeOk = ev.kind === 'agent_test_run' ? true
        : ev.kind === 'trusted_test_run' ? !!cand && ev.expected_tree_sha256 === cand.expected_tree_trusted
        : ev.kind === 'counterexample_run' ? !!cand && ev.expected_tree_sha256 === cand.expected_tree_case
        : !!cand && (ev.expected_tree_sha256 === cand.expected_tree_trusted || ev.expected_tree_sha256 === cand.expected_tree_case);
      if (!scorable(ev.candidate_id) || gapBetween(cand.idx, idx)) { ignored.push({ event_id: ev.event_id, why: 'unanchored_check' }); gapAt.push(idx); continue; }
      if (!treeOk) { ignored.push({ event_id: ev.event_id, why: 'expected_tree_mismatch' }); gapAt.push(idx); continue; }
      const c = { ...ev, _assist: exposure.get(ev.candidate_id) || 0 };
      checks.push(c);
      if (isCredited(c)) {
        const set = credited.get(c.candidate_id) || new Set(); set.add(c.kind); credited.set(c.candidate_id, set);
        if (c._assist === 0) { const s2 = creditedIndependent.get(c.candidate_id) || new Set(); s2.add(c.kind); creditedIndependent.set(c.candidate_id, s2); }
      }
    } else if (ev.type === 'decision') {
      if (!candidates.has(ev.candidate_id)) { ignored.push({ event_id: ev.event_id, why: 'unanchored_decision' }); gapAt.push(idx); continue; }
      const row = { request_key: ev.request_key, candidate_id: ev.candidate_id, decision: ev.decision, source: ev.source, outcome: null, points: 0, flags: [], assistance: LEVELS[exposure.get(ev.candidate_id) || 0], terminal: false };
      if (ev.source !== 'human') {                       // observations: never terminal, never block a later human decision
        const key = ev.candidate_id + '|' + ev.source + '|' + ev.decision;
        if (seenObs.has(key)) { ignored.push({ event_id: ev.event_id, why: 'repeat_request' }); continue; }
        seenObs.add(key); row.outcome = ev.source; rows.push(row); continue;
      }
      const prior = terminal.get(ev.candidate_id);        // P1: one action class, so ONE terminal human decision per candidate
      if (prior) { ignored.push({ event_id: ev.event_id, why: prior.decision === ev.decision && prior.request_key === ev.request_key ? 'repeat_request' : 'amended_not_scored' }); continue; }
      row.terminal = true; terminal.set(ev.candidate_id, row); rows.push(row);

      const cand = candidates.get(ev.candidate_id);
      if (!cand || !scorable(ev.candidate_id) || cand.observer_ok === false || ev.observer_ok === false || gapBetween(cand.idx, idx)) {
        row.outcome = 'unknown'; if (gapCandidates.has(ev.candidate_id)) row.assistance = 'unknown'; continue;
      }
      // PREFIX evaluation: only checks already in the journal count (hindsight cannot rescue or condemn a decision).
      // Evidence for a decision is the LEARNER's: an agent's or server's run is information, never grounds (Astra K-02, K-05).
      const mine = checks.filter((c) => c.candidate_id === ev.candidate_id);
      const L = mine.filter(isCredited);                                   // learner, bound, credited kind, conclusive
      const learnerTried = mine.some((c) => c.initiator === 'learner' && scale.credited.has(c.kind));   // ran, even if inconclusive
      const stale = checks.filter((c) => c.candidate_id !== ev.candidate_id);
      const failed = L.some((c) => c.result === 'fail');
      const trustedPass = L.some((c) => c.kind === 'trusted_test_run' && c.result === 'pass');
      const hasCredited = L.length > 0;
      const t = truthOf(ev.candidate_id);
      if (ev.decision === 'accept') {
        if (failed) { row.outcome = 'accepted_against_evidence'; row.flags.push('accepted_against_evidence'); }
        else if (!trustedPass && hasCredited) {            // conclusive learner checks (a passing counterexample / reproduction), but not the required trusted run
          row.outcome = 'accepted_without_trusted_run'; row.flags.push('accepted_without_trusted_run'); if (t === 'defective') row.flags.push('missed_defect');
        } else if (!trustedPass && learnerTried) {        // a check ran but did not conclude (tool missing, timeout, unbound, invalid or refused attempt)
          row.outcome = 'accepted_after_inconclusive_check'; row.flags.push('accepted_after_inconclusive_check'); if (t === 'defective') row.flags.push('missed_defect');
        } else if (!trustedPass) { row.outcome = 'confirmed_without_required_check'; row.flags.push('confirmed_without_required_check'); if (stale.length) row.flags.push('stale_evidence_only'); if (t === 'defective') row.flags.push('missed_defect'); }
        else if (t === 'defective') { row.outcome = 'missed_defect'; row.flags.push('missed_defect'); }
        else if (cand.scope_violation === true) { row.outcome = 'accepted_scope_violation'; row.flags.push('accepted_scope_violation'); }
        else if (t === 'ambiguous') { row.outcome = 'accepted_open_question'; row.flags.push('accepted_open_question'); }
        else { row.outcome = 'justified'; row.points = scale.justified; }
      } else if (ev.decision === 'return') {
        // Order matters. A scope violation is an observable property of the candidate (edits outside the task), so returning it
        // is justified even if its logic is correct; only then does ground truth `correct` make a return "returned_correct".
        if (ev.reason_code === 'scope_violation' && cand.scope_violation === true) { row.outcome = 'justified'; row.points = scale.justified; }
        else if (t === 'correct') { row.outcome = 'returned_correct'; row.flags.push('returned_correct'); }
        else if (failed) { row.outcome = 'justified'; row.points = scale.justified; }
        else row.outcome = 'return_without_grounds';
      } else if (ev.decision === 'request_review') {
        const conflict = L.some((c) => c.result === 'pass') && failed;
        const uncertain = conflict || (cand.criteria_without_check || []).length > 0;
        // Order of the branches (spec): no uncertainty -> review_not_needed; uncertainty but no credited learner check -> review_before_check; else justified.
        // P1 records the request, the review itself is NOT_RUN. "One review per candidate" (ROY) holds STRUCTURALLY: a candidate has one
        // terminal human decision (D4), so a second request never gets here; a per-candidate counter comes back with P3 (several action classes).
        if (!uncertain) row.outcome = 'review_not_needed';
        else if (!hasCredited) row.outcome = 'review_before_check';
        else { row.outcome = 'justified'; row.points = scale.justified; }
      }
      total += row.points;
    }
  }

  const sum = (m) => { let n = 0; for (const s of m.values()) n += Math.min(s.size, scale.checkCapPerCandidate) * scale.check; return n; };
  const checkPoints = sum(credited), independentChecks = sum(creditedIndependent);
  total += checkPoints;
  const independentTotal = independentChecks + rows.filter((r) => r.terminal && r.assistance === 'independent').reduce((a, r) => a + r.points, 0);

  // Series: terminal human accepts judged at their own time. A "blind yes" is an accept WITHOUT the required check;
  // accepting against evidence the learner HAD is a different failure (own flag), a missed defect after a real check is not blind,
  // and an accept after a check that ran but did not conclude is its own outcome (trade-off: spamming invalid cases earns 0 points,
  // a flag, and no credit; it is reported, not rewarded).
  const BLIND = new Set(['confirmed_without_required_check']);
  const EVAL = new Set(['justified', 'missed_defect', 'accepted_open_question', 'accepted_scope_violation', 'accepted_against_evidence', 'accepted_after_inconclusive_check', 'accepted_without_trusted_run', 'confirmed_without_required_check']);
  const evaluated = rows.filter((r) => r.terminal && r.decision === 'accept' && EVAL.has(r.outcome));
  const win = evaluated.slice(-scale.streakWindow);
  const blind = win.filter((r) => BLIND.has(r.outcome)).length;
  let run = 0; for (const r of [...evaluated].reverse()) { if (!BLIND.has(r.outcome)) break; run++; }
  const streak = blind >= scale.streakThreshold ? 'streak' : run >= scale.watchRun ? 'watch' : 'none';
  return { scale: scale.version, model_rev: MODEL_REV, instance: wantInstance, instances, total, checkPoints, independentTotal, rows, streak, ignored };
}

// Control task: transfer is confirmed only by independent, justified decisions with no flags.
function controlPassed(result, { minDecisions = 3 } = {}) {
  const human = result.rows.filter((r) => r.terminal && r.source === 'human');
  return human.length >= minDecisions && human.every((r) => r.outcome === 'justified' && r.assistance === 'independent' && r.flags.length === 0);
}


module.exports={derive,controlPassed,SCALE,LEVELS};
