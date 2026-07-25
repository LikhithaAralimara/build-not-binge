// ── 1. STORAGE HELPERS ──────────────────────────────────────────────────────

function getStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function setStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function clearStorage(key) {
  try { localStorage.removeItem(key); } catch {}
}
function localDateKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv'); // YYYY-MM-DD in local time
}

// ── 2. DEFAULT DATA ─────────────────────────────────────────────────────────

const DEFAULT_GOALS = [
  { id: 'g1', text: 'Digital Product Book — self help (you have one ChatGPT session open)' },
  { id: 'g2', text: 'Digital Product Creator OS' },
  { id: 'g3', text: 'Creator OS app' },
  { id: 'g4', text: 'PVM — protein vending machine: create a pitch deck and just start pitching to people' },
  { id: 'g5', text: 'Mind Company — refine the idea to the max, register the company, start applying for grants' },
  { id: 'g6', text: 'GoodCop BadCop / Double Agent' },
  { id: 'g7', text: 'Learn how to publish apps on Play Store and App Store' },
];

const NEW_GOALS_V2 = [
  { id: 'g6', text: 'GoodCop BadCop / Double Agent' },
  { id: 'g7', text: 'Learn how to publish apps on Play Store and App Store' },
];

function initStorage() {
  if (!getStorage('rdp_schema_version')) {
    setStorage('rdp_schema_version', '2');
    setStorage('rdp_goals', DEFAULT_GOALS);
    setStorage('rdp_shame_counts', {});
    setStorage('rdp_decisions', []);
    setStorage('rdp_streak', { currentStreak: 0, lastCommitDate: null, longestStreak: 0 });
    return;
  }
  // Migration: v1 → v2 — append new goals if not already present
  if (getStorage('rdp_schema_version') === '1') {
    const goals = getStorage('rdp_goals') || [];
    const existingIds = new Set(goals.map(g => g.id));
    NEW_GOALS_V2.forEach(g => { if (!existingIds.has(g.id)) goals.push(g); });
    setStorage('rdp_goals', goals);
    setStorage('rdp_schema_version', '2');
  }
}

// ── 3. STATE MACHINE ─────────────────────────────────────────────────────────

let state = 'idle'; // idle | selecting | committed
let selectedGoalId = null;
let pageHasBeenHidden = false;

function transitionTo(newState) {
  state = newState;
  if (state === 'committed') {
    disableExitFriction();
  } else {
    enableExitFriction();
  }
}

// ── 4. SHAME COUNTER ─────────────────────────────────────────────────────────

function incrementShameCounter() {
  const today = localDateKey();
  const counts = getStorage('rdp_shame_counts') || {};
  counts[today] = (counts[today] || 0) + 1;
  setStorage('rdp_shame_counts', counts);
}

function getTodayCount() {
  return (getStorage('rdp_shame_counts') || {})[localDateKey()] || 0;
}

function getWeekCount() {
  const counts = getStorage('rdp_shame_counts') || {};
  let total = 0;
  for (let i = 0; i < 7; i++) {
    total += counts[localDateKey(-i)] || 0;
  }
  return total;
}

function renderShameBar() {
  const today = getTodayCount();
  const week = getWeekCount();
  document.getElementById('shame-today').textContent =
    `You've been here ${today}x today`;
  document.getElementById('shame-week').textContent =
    `${week}x this week`;
}

// ── 5. STREAK ────────────────────────────────────────────────────────────────

function evaluateStreak() {
  const today = localDateKey();
  const streak = getStorage('rdp_streak') || { currentStreak: 0, lastCommitDate: null, longestStreak: 0 };

  if (streak.lastCommitDate === today) return streak; // already committed today

  const yesterday = localDateKey(-1);
  if (streak.lastCommitDate === yesterday) {
    streak.currentStreak += 1;
  } else {
    streak.currentStreak = 1; // gap — reset
  }

  streak.lastCommitDate = today;
  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
  setStorage('rdp_streak', streak);
  return streak;
}

function renderStreakBadge() {
  const streak = getStorage('rdp_streak') || {};
  const el = document.getElementById('streak-badge');
  if (streak.currentStreak >= 1) {
    el.textContent = `${streak.currentStreak} day${streak.currentStreak !== 1 ? 's' : ''} in a row choosing work`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ── 6. GOALS ─────────────────────────────────────────────────────────────────

function getGoals() {
  return getStorage('rdp_goals') || DEFAULT_GOALS;
}

function renderGoals() {
  const goals = getGoals();
  const list = document.getElementById('goal-list');
  list.innerHTML = '';

  goals.forEach(goal => {
    const card = document.createElement('div');
    card.className = 'goal-card' + (goal.id === selectedGoalId ? ' selected' : '');
    card.dataset.id = goal.id;

    card.innerHTML = `
      <span class="goal-card-text">${escapeHtml(goal.text)}</span>
      <div class="goal-card-actions">
        <button class="goal-delete-btn" data-id="${goal.id}" title="Remove goal">✕</button>
        <span class="goal-card-arrow">→</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('goal-delete-btn')) return;
      selectGoal(goal.id);
    });

    card.querySelector('.goal-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGoal(goal.id);
    });

    list.appendChild(card);
  });
}

function selectGoal(goalId) {
  selectedGoalId = goalId;
  transitionTo('selecting');
  renderGoals();
  // Show micro-task section
  document.getElementById('microtask-section').classList.remove('hidden');
  document.getElementById('commit-wrapper').classList.remove('hidden');
  document.getElementById('microtask-input').focus();
  validateCommit();
}

function deleteGoal(goalId) {
  if (!confirm('Remove this goal?')) return;
  let goals = getGoals().filter(g => g.id !== goalId);
  setStorage('rdp_goals', goals);
  if (selectedGoalId === goalId) {
    selectedGoalId = null;
    transitionTo('idle');
    document.getElementById('microtask-section').classList.add('hidden');
    document.getElementById('commit-wrapper').classList.add('hidden');
  }
  renderGoals();
}

function addGoal(text) {
  const goals = getGoals();
  goals.push({ id: 'g' + Date.now(), text: text.trim() });
  setStorage('rdp_goals', goals);
  renderGoals();
}

// ── 7. COMMITMENT LOCK ────────────────────────────────────────────────────────

function validateCommit() {
  const task = document.getElementById('microtask-input').value.trim();
  const charCount = document.getElementById('char-count');
  const btn = document.getElementById('commit-btn');
  const len = task.length;

  charCount.textContent = `${len} / 10 min`;
  charCount.classList.toggle('ready', len >= 10);
  btn.disabled = !(selectedGoalId && len >= 10);
}

function commitDecision() {
  const task = document.getElementById('microtask-input').value.trim();
  const goals = getGoals();
  const goal = goals.find(g => g.id === selectedGoalId);
  if (!goal || task.length < 10) return;

  const decision = {
    id: 'dec_' + Date.now(),
    ts: new Date().toISOString(),
    goalId: goal.id,
    goalText: goal.text,
    microTask: task,
    outcome: null,
  };

  const decisions = getStorage('rdp_decisions') || [];
  decisions.unshift(decision); // newest first
  setStorage('rdp_decisions', decisions);

  const streak = evaluateStreak();
  transitionTo('committed');
  showCommittedOverlay(goal.text, task, streak);
  renderHistory();
  renderStreakBadge();
}

// ── 8. COMMITTED OVERLAY ─────────────────────────────────────────────────────

function showCommittedOverlay(goalText, task, streak) {
  document.getElementById('committed-goal-display').textContent = goalText;
  document.getElementById('committed-task-display').textContent = `"${task}"`;

  const badge = document.getElementById('streak-committed-badge');
  if (streak.currentStreak >= 2) {
    badge.textContent = `${streak.currentStreak} days in a row — keep it going`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  document.getElementById('committed-overlay').classList.remove('hidden');
}

function hideCommittedOverlay() {
  document.getElementById('committed-overlay').classList.add('hidden');
  // Reset UI for next decision
  selectedGoalId = null;
  document.getElementById('microtask-input').value = '';
  document.getElementById('microtask-section').classList.add('hidden');
  document.getElementById('commit-wrapper').classList.add('hidden');
  validateCommit();
  renderGoals();
  transitionTo('idle');
}

// ── 9. EXIT FRICTION ──────────────────────────────────────────────────────────

function onBeforeUnload(e) {
  if (state === 'idle' || state === 'selecting') {
    e.preventDefault();
    e.returnValue = ''; // required by spec; browser ignores the string value
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    pageHasBeenHidden = true;
  } else if (document.visibilityState === 'visible' && pageHasBeenHidden) {
    if (state === 'idle' || state === 'selecting') {
      showGuiltOverlay();
    }
  }
}

function enableExitFriction() {
  window.addEventListener('beforeunload', onBeforeUnload);
}
function disableExitFriction() {
  window.removeEventListener('beforeunload', onBeforeUnload);
}

function showGuiltOverlay() {
  document.getElementById('guilt-overlay').classList.remove('hidden');
}
function hideGuiltOverlay() {
  document.getElementById('guilt-overlay').classList.add('hidden');
}

// ── 10. DECISION HISTORY ──────────────────────────────────────────────────────

function renderHistory() {
  const decisions = getStorage('rdp_decisions') || [];
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const countEl = document.getElementById('history-count');

  countEl.textContent = decisions.length;

  if (decisions.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = '';
  decisions.forEach(dec => {
    const entry = document.createElement('div');
    entry.className = 'history-entry' + (dec.outcome ? ' has-outcome' : '');
    entry.dataset.id = dec.id;

    const ts = formatTs(dec.ts);
    const outcomeHtml = dec.outcome
      ? `<div class="history-outcome"><span class="outcome-check">✓</span> ${escapeHtml(dec.outcome)}</div>
         <button class="add-outcome-btn" data-id="${dec.id}">Edit outcome</button>`
      : `<button class="add-outcome-btn" data-id="${dec.id}">Add outcome →</button>`;

    entry.innerHTML = `
      <div class="history-ts">${ts}</div>
      <div class="history-goal">${escapeHtml(dec.goalText)}</div>
      <div class="history-task">"${escapeHtml(dec.microTask)}"</div>
      ${outcomeHtml}
    `;

    entry.querySelector('.add-outcome-btn').addEventListener('click', () => {
      openOutcomeForm(dec.id, entry, dec.outcome || '');
    });

    list.appendChild(entry);
  });
}

function openOutcomeForm(decId, entryEl, existingOutcome) {
  // Remove any existing open forms first
  document.querySelectorAll('.outcome-form').forEach(f => f.remove());
  const addBtn = entryEl.querySelector('.add-outcome-btn');
  addBtn.style.display = 'none';

  const form = document.createElement('div');
  form.className = 'outcome-form';
  form.innerHTML = `
    <textarea class="outcome-textarea" placeholder="What actually happened? What did you build, learn, or decide?">${escapeHtml(existingOutcome)}</textarea>
    <button class="outcome-save-btn">Save</button>
    <button class="outcome-cancel-btn">Cancel</button>
  `;

  form.querySelector('.outcome-save-btn').addEventListener('click', () => {
    const text = form.querySelector('.outcome-textarea').value.trim();
    if (!text) return;
    saveOutcome(decId, text);
  });
  form.querySelector('.outcome-cancel-btn').addEventListener('click', () => {
    form.remove();
    addBtn.style.display = '';
  });

  addBtn.after(form);
  form.querySelector('.outcome-textarea').focus();
}

function saveOutcome(decId, text) {
  const decisions = getStorage('rdp_decisions') || [];
  const dec = decisions.find(d => d.id === decId);
  if (dec) {
    dec.outcome = text;
    setStorage('rdp_decisions', decisions);
  }
  renderHistory();
}

// ── 11. WEEKLY EXPORT ─────────────────────────────────────────────────────────

function exportWeek() {
  const decisions = getStorage('rdp_decisions') || [];
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weekDecisions = decisions.filter(d => new Date(d.ts) >= monday);

  if (weekDecisions.length === 0) {
    document.getElementById('export-btn').textContent = 'Nothing this week yet';
    setTimeout(() => { document.getElementById('export-btn').textContent = 'Export this week\'s log'; }, 2000);
    return;
  }

  const weekStart = monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const weekEnd = new Date(monday);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const streak = getStorage('rdp_streak') || {};
  let text = `build-not-binge | Week of ${weekStart}–${weekEndStr}\n`;
  text += '━'.repeat(48) + '\n';
  if (streak.currentStreak > 0) text += `Current streak: ${streak.currentStreak} days in a row\n`;
  text += '\n';

  weekDecisions.forEach(dec => {
    const ts = new Date(dec.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    text += `${ts}  |  ${dec.goalText}\n`;
    text += `              Task: ${dec.microTask}\n`;
    if (dec.outcome) text += `              Outcome: ${dec.outcome}\n`;
    text += '\n';
  });

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('export-btn');
    btn.textContent = 'Copied to clipboard!';
    setTimeout(() => { btn.textContent = "Export this week's log"; }, 2000);
  });
}

// ── 12. UTILITIES ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTs(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── 13. EVENT WIRING ──────────────────────────────────────────────────────────

function wireEvents() {
  // Micro-task input validation
  document.getElementById('microtask-input').addEventListener('input', validateCommit);

  // Commit button
  document.getElementById('commit-btn').addEventListener('click', commitDecision);

  // Committed overlay dismiss
  document.getElementById('committed-done-btn').addEventListener('click', hideCommittedOverlay);

  // Guilt overlay dismiss
  document.getElementById('guilt-dismiss').addEventListener('click', () => {
    hideGuiltOverlay();
    document.getElementById('goal-section').scrollIntoView({ behavior: 'smooth' });
  });

  // Add goal trigger
  document.getElementById('add-goal-trigger').addEventListener('click', () => {
    document.getElementById('add-goal-form').classList.remove('hidden');
    document.getElementById('add-goal-input').focus();
  });
  document.getElementById('add-goal-cancel').addEventListener('click', () => {
    document.getElementById('add-goal-form').classList.add('hidden');
    document.getElementById('add-goal-input').value = '';
  });
  document.getElementById('add-goal-save').addEventListener('click', () => {
    const val = document.getElementById('add-goal-input').value.trim();
    if (!val) return;
    addGoal(val);
    document.getElementById('add-goal-input').value = '';
    document.getElementById('add-goal-form').classList.add('hidden');
  });
  document.getElementById('add-goal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('add-goal-save').click();
    if (e.key === 'Escape') document.getElementById('add-goal-cancel').click();
  });

  // History toggle
  document.getElementById('history-toggle').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const toggle = document.getElementById('history-toggle');
    const isOpen = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', isOpen);
    toggle.classList.toggle('open', !isOpen);
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', exportWeek);

  // Visibility change for guilt overlay
  document.addEventListener('visibilitychange', onVisibilityChange);
}

// ── 14. INIT ──────────────────────────────────────────────────────────────────

function init() {
  initStorage();
  incrementShameCounter();
  renderShameBar();
  renderGoals();
  renderStreakBadge();
  renderHistory();
  enableExitFriction();
  wireEvents();
}

document.addEventListener('DOMContentLoaded', init);
