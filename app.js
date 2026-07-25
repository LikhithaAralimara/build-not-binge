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
    setStorage('rdp_schema_version', '3');
    setStorage('rdp_goals', DEFAULT_GOALS);
    setStorage('rdp_shame_counts', {});
    setStorage('rdp_decisions', []);
    setStorage('rdp_streak', { currentStreak: 0, lastCommitDate: null, longestStreak: 0 });
    setStorage('rdp_active_session', null);
    setStorage('rdp_alternative_log', []);
    return;
  }
  // v1 → v2: add new goals
  if (getStorage('rdp_schema_version') === '1') {
    const goals = getStorage('rdp_goals') || [];
    const existingIds = new Set(goals.map(g => g.id));
    NEW_GOALS_V2.forEach(g => { if (!existingIds.has(g.id)) goals.push(g); });
    setStorage('rdp_goals', goals);
    setStorage('rdp_schema_version', '2');
  }
  // v2 → v3: add session + alt log keys
  if (getStorage('rdp_schema_version') === '2') {
    if (!getStorage('rdp_active_session')) setStorage('rdp_active_session', null);
    if (!getStorage('rdp_alternative_log')) setStorage('rdp_alternative_log', []);
    setStorage('rdp_schema_version', '3');
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
  for (let i = 0; i < 7; i++) total += counts[localDateKey(-i)] || 0;
  return total;
}

function renderShameBar() {
  const today = getTodayCount();
  const week = getWeekCount();
  document.getElementById('shame-today').textContent = `You've been here ${today}x today`;
  document.getElementById('shame-week').textContent = `${week}x this week`;
}

// ── 5. STREAK ────────────────────────────────────────────────────────────────

function evaluateStreak() {
  const today = localDateKey();
  const streak = getStorage('rdp_streak') || { currentStreak: 0, lastCommitDate: null, longestStreak: 0 };
  if (streak.lastCommitDate === today) return streak;
  const yesterday = localDateKey(-1);
  streak.currentStreak = streak.lastCommitDate === yesterday ? streak.currentStreak + 1 : 1;
  streak.lastCommitDate = today;
  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
  setStorage('rdp_streak', streak);
  return streak;
}

function renderStreakHeatmap() {
  const streak = getStorage('rdp_streak') || { currentStreak: 0, longestStreak: 0 };
  const decisions = getStorage('rdp_decisions') || [];
  const altLog = getStorage('rdp_alternative_log') || [];

  // Build activity map: localDate → commit count
  const activityMap = {};
  decisions.forEach(d => {
    const key = new Date(d.ts).toLocaleDateString('sv');
    activityMap[key] = (activityMap[key] || 0) + 1;
  });
  // Break activities add a fractional signal (shown differently via CSS not count)
  const breakMap = {};
  altLog.forEach(a => {
    const key = new Date(a.ts).toLocaleDateString('sv');
    breakMap[key] = (breakMap[key] || 0) + 1;
  });

  // Streak text
  const textEl = document.getElementById('streak-text');
  if (streak.currentStreak >= 1) {
    textEl.textContent = `${streak.currentStreak} day${streak.currentStreak !== 1 ? 's' : ''} in a row choosing work`;
    textEl.classList.remove('hidden');
  } else {
    textEl.classList.add('hidden');
  }

  // Build 10-week grid (Mon → Sun columns)
  const WEEKS = 10;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toLocaleDateString('sv');

  // Find the Monday that starts our grid
  const dayOfWeekMon = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
  const gridStart = new Date(today);
  gridStart.setDate(today.getDate() - dayOfWeekMon - (WEEKS - 1) * 7);

  // Build weeks array: each entry is an array of 7 day objects
  const weeksData = [];
  for (let w = 0; w < WEEKS; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + w * 7 + d);
      const key = day.toLocaleDateString('sv');
      const commits = activityMap[key] || 0;
      const breaks = breakMap[key] || 0;
      const isFuture = day > today;
      const isToday = key === todayKey;
      week.push({ day, key, commits, breaks, isFuture, isToday });
    }
    weeksData.push(week);
  }

  // Month labels: detect where month changes across week columns
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const container = document.getElementById('streak-heatmap');
  container.innerHTML = '';

  // Month label row
  const monthRow = document.createElement('div');
  monthRow.className = 'heatmap-month-row';
  // Day labels spacer
  const spacer = document.createElement('span');
  spacer.className = 'heatmap-day-spacer';
  monthRow.appendChild(spacer);

  let lastMonth = -1;
  weeksData.forEach((week) => {
    const firstDayOfWeek = week[0].day;
    const month = firstDayOfWeek.getMonth();
    const label = document.createElement('span');
    label.className = 'heatmap-month-label';
    label.textContent = month !== lastMonth ? MONTH_NAMES[month] : '';
    lastMonth = month;
    monthRow.appendChild(label);
  });
  container.appendChild(monthRow);

  // Grid rows (one per day of week)
  for (let d = 0; d < 7; d++) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';

    const dayLabel = document.createElement('span');
    dayLabel.className = 'heatmap-day-label';
    dayLabel.textContent = DAY_LABELS[d];
    row.appendChild(dayLabel);

    weeksData.forEach(week => {
      const cell = week[d];
      const tile = document.createElement('span');
      tile.className = 'heatmap-tile';

      if (cell.isFuture) {
        tile.classList.add('tile-future');
      } else if (cell.commits === 0 && cell.breaks === 0) {
        tile.classList.add('tile-0');
      } else if (cell.commits === 0 && cell.breaks > 0) {
        tile.classList.add('tile-break');
      } else if (cell.commits === 1) {
        tile.classList.add('tile-1');
      } else if (cell.commits === 2) {
        tile.classList.add('tile-2');
      } else {
        tile.classList.add('tile-3');
      }

      if (cell.isToday) tile.classList.add('tile-today');

      // Tooltip
      const dateStr = cell.day.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      const parts = [];
      if (cell.commits) parts.push(`${cell.commits} work session${cell.commits > 1 ? 's' : ''}`);
      if (cell.breaks) parts.push(`${cell.breaks} break${cell.breaks > 1 ? 's' : ''}`);
      tile.title = parts.length ? `${dateStr}: ${parts.join(', ')}` : dateStr;

      row.appendChild(tile);
    });

    container.appendChild(row);
  }

  // Longest streak note
  if (streak.longestStreak > 1) {
    const note = document.createElement('div');
    note.className = 'heatmap-best';
    note.textContent = `Best streak: ${streak.longestStreak} days`;
    container.appendChild(note);
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
    workMinutes: null,
  };

  const decisions = getStorage('rdp_decisions') || [];
  decisions.unshift(decision);
  setStorage('rdp_decisions', decisions);

  // Persist the active session so returning page load knows they're locked in
  setStorage('rdp_active_session', {
    decId: decision.id,
    goalText: goal.text,
    microTask: task,
    commitTs: Date.now(),
  });

  const streak = evaluateStreak();
  transitionTo('committed');
  showCommittedOverlay(goal.text, task, streak);
  renderHistory();
  renderStreakHeatmap();
}

// ── 8. COMMITTED OVERLAY (fresh commit) ──────────────────────────────────────

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
  // Just hides the overlay — user is going to work. Session stays active.
  document.getElementById('committed-overlay').classList.add('hidden');
}

// ── 9. RETURNING OVERLAY (page reload while session active) ──────────────────

function elapsedString(commitTs) {
  const ms = Date.now() - commitTs;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function showReturningOverlay(session) {
  document.getElementById('returning-goal').textContent = session.goalText;
  document.getElementById('returning-task').textContent = `"${session.microTask}"`;
  document.getElementById('returning-elapsed').textContent = `Committed ${elapsedString(session.commitTs)}`;

  const overlay = document.getElementById('returning-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('return-done-btn').addEventListener('click', () => {
    submitReturnFeedback(session.decId);
  });

  document.getElementById('return-still-going-btn').addEventListener('click', () => {
    overlay.classList.add('hidden');
    // Show the normal page in committed state (no exit friction)
    renderNormalPage();
    transitionTo('committed');
  });
}

function submitReturnFeedback(decId) {
  const outcome = document.getElementById('return-outcome').value.trim();
  const mins = parseInt(document.getElementById('return-mins').value, 10);

  const decisions = getStorage('rdp_decisions') || [];
  const dec = decisions.find(d => d.id === decId);
  if (dec) {
    if (outcome) dec.outcome = outcome;
    if (!isNaN(mins) && mins > 0) dec.workMinutes = mins;
    setStorage('rdp_decisions', decisions);
  }

  clearStorage('rdp_active_session');
  // Re-run a fresh init to show the normal page
  document.getElementById('returning-overlay').classList.add('hidden');
  runNormalInit();
}

// ── 10. EXIT FRICTION ──────────────────────────────────────────────────────────

function onBeforeUnload(e) {
  if (state === 'idle' || state === 'selecting') {
    e.preventDefault();
    e.returnValue = '';
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    pageHasBeenHidden = true;
  } else if (document.visibilityState === 'visible' && pageHasBeenHidden) {
    if (state === 'idle' || state === 'selecting') showGuiltOverlay();
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

// ── 11. MINDFUL BREAK ALTERNATIVES ────────────────────────────────────────────

function logAlternative(type, details) {
  const log = getStorage('rdp_alternative_log') || [];
  log.unshift({ ts: new Date().toISOString(), type, details });
  setStorage('rdp_alternative_log', log);
}

function closeAltPanel() {
  const panel = document.getElementById('alt-panel');
  panel.innerHTML = '';
  panel.classList.add('hidden');
  document.querySelectorAll('.alt-card').forEach(c => c.classList.remove('active'));
}

function renderAltPanel(html) {
  const panel = document.getElementById('alt-panel');
  panel.innerHTML = html;
  panel.classList.remove('hidden');
  // Wire cancel buttons
  panel.querySelectorAll('.alt-cancel-btn').forEach(btn => {
    btn.addEventListener('click', closeAltPanel);
  });
}

function openAlternative(type) {
  // Toggle off if already open
  const panel = document.getElementById('alt-panel');
  if (!panel.classList.contains('hidden')) {
    const currentType = panel.dataset.type;
    closeAltPanel();
    if (currentType === type) return;
  }
  panel.dataset.type = type;
  document.querySelectorAll('.alt-card').forEach(c =>
    c.classList.toggle('active', c.dataset.type === type)
  );

  switch (type) {
    case 'water': openWater(); break;
    case 'dance': openDance(); break;
    case 'walk':  openWalkStep1(); break;
    case 'book':  openBookStep1(); break;
  }
}

function openWater() {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">💧</div>
      <p class="alt-panel-title">You paused to hydrate.</p>
      <p class="alt-panel-sub">Seriously good habit. Most people don't drink enough.</p>
      <button id="alt-water-done" class="alt-primary-btn">✓ I drank water</button>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.getElementById('alt-water-done').addEventListener('click', () => {
    logAlternative('water', {});
    closeAltPanel();
    flashAltSuccess('Hydrated. Good. Now back to work.');
  });
}

function openDance() {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">🎵</div>
      <p class="alt-panel-title">Put on ONE song and actually move.</p>
      <p class="alt-panel-sub">Don't scroll. Don't browse. Just play something and dance.</p>
      <div class="alt-inline-row">
        <span class="alt-row-label">I danced for</span>
        <input type="number" id="alt-dance-mins" class="alt-num-input" min="1" max="60" placeholder="2">
        <span class="alt-row-label">minutes</span>
      </div>
      <button id="alt-dance-done" class="alt-primary-btn">I danced! Log it</button>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.getElementById('alt-dance-done').addEventListener('click', () => {
    const mins = parseInt(document.getElementById('alt-dance-mins').value, 10) || 2;
    logAlternative('dance', { actualMinutes: mins });
    closeAltPanel();
    flashAltSuccess(`${mins} mins of movement done. Legend.`);
  });
}

function openWalkStep1() {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">🚶</div>
      <p class="alt-panel-title">How long are you planning to walk?</p>
      <div class="alt-duration-grid">
        <button class="alt-duration-btn" data-mins="5">5 min</button>
        <button class="alt-duration-btn" data-mins="10">10 min</button>
        <button class="alt-duration-btn" data-mins="20">20 min</button>
        <button class="alt-duration-btn" data-mins="30">30 min</button>
      </div>
      <div class="alt-inline-row">
        <span class="alt-row-label">or</span>
        <input type="number" id="alt-walk-custom" class="alt-num-input" min="1" max="120" placeholder="custom">
        <span class="alt-row-label">min</span>
        <button id="alt-walk-custom-go" class="alt-small-btn">Go →</button>
      </div>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.querySelectorAll('.alt-duration-btn').forEach(btn => {
    btn.addEventListener('click', () => openWalkStep2(parseInt(btn.dataset.mins)));
  });
  document.getElementById('alt-walk-custom-go').addEventListener('click', () => {
    const mins = parseInt(document.getElementById('alt-walk-custom').value, 10);
    if (mins > 0) openWalkStep2(mins);
  });
}

function openWalkStep2(plannedMins) {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">🚶</div>
      <p class="alt-panel-title">Go. See you in ${plannedMins} min.</p>
      <p class="alt-panel-sub">Phone in pocket. Eyes up. Move.</p>
      <div class="alt-inline-row">
        <span class="alt-row-label">I walked for</span>
        <input type="number" id="alt-walk-actual" class="alt-num-input" min="1" max="120" value="${plannedMins}">
        <span class="alt-row-label">minutes</span>
      </div>
      <button id="alt-walk-done" class="alt-primary-btn">I'm back — log it</button>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.getElementById('alt-walk-done').addEventListener('click', () => {
    const actual = parseInt(document.getElementById('alt-walk-actual').value, 10) || plannedMins;
    logAlternative('walk', { plannedMinutes: plannedMins, actualMinutes: actual });
    closeAltPanel();
    flashAltSuccess(`${actual} min walk done. Fresh air is underrated.`);
  });
}

function openBookStep1() {
  const currentBook = getStorage('rdp_current_book');
  if (currentBook && currentBook.title) {
    renderAltPanel(`
      <div class="alt-panel-content">
        <div class="alt-panel-icon">📖</div>
        <p class="alt-panel-title">Reading "${escapeHtml(currentBook.title)}"?</p>
        <p class="alt-panel-sub">Planning ${currentBook.planMinutes} mins</p>
        <button id="alt-book-continue" class="alt-primary-btn">Yes, this one →</button>
        <button id="alt-book-change" class="alt-small-btn">Different book</button>
        <button class="alt-cancel-btn btn-ghost">Cancel</button>
      </div>
    `);
    document.getElementById('alt-book-continue').addEventListener('click', () => {
      openBookStep2(currentBook.title, currentBook.planMinutes);
    });
    document.getElementById('alt-book-change').addEventListener('click', openBookForm);
  } else {
    openBookForm();
  }
}

function openBookForm() {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">📖</div>
      <p class="alt-panel-title">What are you reading?</p>
      <input type="text" id="alt-book-title-input" class="alt-text-input" placeholder="Book title">
      <div class="alt-inline-row">
        <span class="alt-row-label">Planning to read for</span>
        <input type="number" id="alt-book-plan-mins" class="alt-num-input" min="1" max="120" placeholder="20">
        <span class="alt-row-label">minutes</span>
      </div>
      <button id="alt-book-start" class="alt-primary-btn">Start reading →</button>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.getElementById('alt-book-start').addEventListener('click', () => {
    const title = document.getElementById('alt-book-title-input').value.trim();
    const planMins = parseInt(document.getElementById('alt-book-plan-mins').value, 10) || 20;
    if (!title) { document.getElementById('alt-book-title-input').focus(); return; }
    setStorage('rdp_current_book', { title, planMinutes: planMins });
    openBookStep2(title, planMins);
  });
}

function openBookStep2(bookTitle, planMins) {
  renderAltPanel(`
    <div class="alt-panel-content">
      <div class="alt-panel-icon">📖</div>
      <p class="alt-panel-title">Read "${escapeHtml(bookTitle)}".</p>
      <p class="alt-panel-sub">No phone. No music. Just the book. Come back when done.</p>
      <div class="alt-inline-row">
        <span class="alt-row-label">I read</span>
        <input type="number" id="alt-book-pages" class="alt-num-input alt-num-small" min="1" placeholder="5">
        <span class="alt-row-label">pages in</span>
        <input type="number" id="alt-book-actual-mins" class="alt-num-input alt-num-small" min="1" placeholder="${planMins}">
        <span class="alt-row-label">mins</span>
      </div>
      <button id="alt-book-done" class="alt-primary-btn">Done — log it</button>
      <button class="alt-cancel-btn btn-ghost">Cancel</button>
    </div>
  `);
  document.getElementById('alt-book-done').addEventListener('click', () => {
    const pages = parseInt(document.getElementById('alt-book-pages').value, 10) || null;
    const actual = parseInt(document.getElementById('alt-book-actual-mins').value, 10) || planMins;
    logAlternative('book', { bookTitle, actualMinutes: actual, pages });
    closeAltPanel();
    flashAltSuccess(`${pages ? pages + ' pages read.' : 'Session logged.'} Books > binge.`);
  });
}

function flashAltSuccess(msg) {
  const section = document.getElementById('alternatives-section');
  const flash = document.createElement('div');
  flash.className = 'alt-success-flash';
  flash.textContent = msg;
  section.appendChild(flash);
  setTimeout(() => flash.remove(), 3000);
}

function wireAlternatives() {
  document.querySelectorAll('.alt-card').forEach(card => {
    card.addEventListener('click', () => openAlternative(card.dataset.type));
  });
}

// ── 12. DECISION HISTORY ──────────────────────────────────────────────────────

const ALT_META = {
  water: { icon: '💧', label: 'Drank water' },
  dance: { icon: '🎵', label: 'Danced' },
  walk:  { icon: '🚶', label: 'Went for a walk' },
  book:  { icon: '📖', label: 'Read' },
};

function renderHistory() {
  const decisions = getStorage('rdp_decisions') || [];
  const altLog    = getStorage('rdp_alternative_log') || [];
  const list      = document.getElementById('history-list');
  const empty     = document.getElementById('history-empty');
  const countEl   = document.getElementById('history-count');

  const total = decisions.length + altLog.length;
  countEl.textContent = total;

  if (total === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = '';

  // Merge and sort newest-first
  const decItems = decisions.map(d => ({ kind: 'decision', ts: d.ts, data: d }));
  const altItems = altLog.map(a => ({ kind: 'alt', ts: a.ts, data: a }));
  const allItems = [...decItems, ...altItems].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  allItems.forEach(item => {
    const entry = document.createElement('div');

    if (item.kind === 'decision') {
      const dec = item.data;
      entry.className = 'history-entry' + (dec.outcome ? ' has-outcome' : '');
      entry.dataset.id = dec.id;

      const ts = formatTs(dec.ts);
      const workLine = dec.workMinutes ? `<span class="history-work-mins">${dec.workMinutes} min</span>` : '';
      const outcomeHtml = dec.outcome
        ? `<div class="history-outcome"><span class="outcome-check">✓</span> ${escapeHtml(dec.outcome)} ${workLine}</div>
           <button class="add-outcome-btn" data-id="${dec.id}">Edit</button>`
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

    } else {
      // Mindful break entry
      const a = item.data;
      const meta = ALT_META[a.type] || { icon: '⚡', label: a.type };
      const details = [];
      if (a.details.actualMinutes) details.push(`${a.details.actualMinutes} min`);
      if (a.details.pages)         details.push(`${a.details.pages} pages`);
      if (a.details.bookTitle)     details.push(a.details.bookTitle);

      entry.className = 'history-entry history-entry-break';
      entry.innerHTML = `
        <div class="history-ts">${formatTs(a.ts)}</div>
        <div class="history-break-label">
          <span class="break-icon">${meta.icon}</span>
          <span>${meta.label}${details.length ? ' — ' + details.join(', ') : ''}</span>
        </div>
      `;
    }

    list.appendChild(entry);
  });
}

function openOutcomeForm(decId, entryEl, existingOutcome) {
  document.querySelectorAll('.outcome-form').forEach(f => f.remove());
  const addBtn = entryEl.querySelector('.add-outcome-btn');
  addBtn.style.display = 'none';

  const dec = (getStorage('rdp_decisions') || []).find(d => d.id === decId);
  const existingMins = dec && dec.workMinutes ? dec.workMinutes : '';

  const form = document.createElement('div');
  form.className = 'outcome-form';
  form.innerHTML = `
    <textarea class="outcome-textarea" placeholder="What actually happened?">${escapeHtml(existingOutcome)}</textarea>
    <div class="outcome-mins-row">
      <input type="number" class="outcome-mins-input" min="1" value="${existingMins}" placeholder="mins worked">
      <span class="outcome-mins-label">minutes worked</span>
    </div>
    <button class="outcome-save-btn">Save</button>
    <button class="outcome-cancel-btn">Cancel</button>
  `;
  form.querySelector('.outcome-save-btn').addEventListener('click', () => {
    const text = form.querySelector('.outcome-textarea').value.trim();
    const mins = parseInt(form.querySelector('.outcome-mins-input').value, 10);
    saveOutcome(decId, text || null, isNaN(mins) ? null : mins);
  });
  form.querySelector('.outcome-cancel-btn').addEventListener('click', () => {
    form.remove();
    addBtn.style.display = '';
  });
  addBtn.after(form);
  form.querySelector('.outcome-textarea').focus();
}

function saveOutcome(decId, text, workMinutes) {
  const decisions = getStorage('rdp_decisions') || [];
  const dec = decisions.find(d => d.id === decId);
  if (dec) {
    if (text !== null) dec.outcome = text;
    if (workMinutes !== null) dec.workMinutes = workMinutes;
    setStorage('rdp_decisions', decisions);
  }
  renderHistory();
}

// ── 13. WEEKLY EXPORT ─────────────────────────────────────────────────────────

function exportWeek() {
  const decisions = getStorage('rdp_decisions') || [];
  const altLog = getStorage('rdp_alternative_log') || [];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weekDecisions = decisions.filter(d => new Date(d.ts) >= monday);
  const weekAlts = altLog.filter(a => new Date(a.ts) >= monday);

  if (weekDecisions.length === 0 && weekAlts.length === 0) {
    const btn = document.getElementById('export-btn');
    btn.textContent = 'Nothing this week yet';
    setTimeout(() => { btn.textContent = "Export this week's log"; }, 2000);
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

  if (weekDecisions.length > 0) {
    text += '─── WORK SESSIONS ───\n\n';
    weekDecisions.forEach(dec => {
      const ts = new Date(dec.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      text += `${ts}  |  ${dec.goalText}\n`;
      text += `              Task: ${dec.microTask}\n`;
      if (dec.workMinutes) text += `              Time: ${dec.workMinutes} mins\n`;
      if (dec.outcome) text += `              Outcome: ${dec.outcome}\n`;
      text += '\n';
    });
  }

  if (weekAlts.length > 0) {
    text += '─── MINDFUL BREAKS ───\n\n';
    const altLabels = { water: '💧 Water', dance: '🎵 Dance', walk: '🚶 Walk', book: '📖 Read' };
    weekAlts.forEach(a => {
      const ts = new Date(a.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      let detail = '';
      if (a.details.actualMinutes) detail += ` ${a.details.actualMinutes} min`;
      if (a.details.pages) detail += `, ${a.details.pages} pages`;
      if (a.details.bookTitle) detail += ` — ${a.details.bookTitle}`;
      text += `${ts}  |  ${altLabels[a.type] || a.type}${detail}\n`;
    });
    text += '\n';
  }

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('export-btn');
    btn.textContent = 'Copied to clipboard!';
    setTimeout(() => { btn.textContent = "Export this week's log"; }, 2000);
  });
}

// ── 14. UTILITIES ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTs(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ── 15. EVENT WIRING ──────────────────────────────────────────────────────────

function wireEvents() {
  document.getElementById('microtask-input').addEventListener('input', validateCommit);
  document.getElementById('commit-btn').addEventListener('click', commitDecision);
  document.getElementById('committed-done-btn').addEventListener('click', hideCommittedOverlay);

  document.getElementById('guilt-dismiss').addEventListener('click', () => {
    hideGuiltOverlay();
    document.getElementById('goal-section').scrollIntoView({ behavior: 'smooth' });
  });

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

  document.getElementById('history-toggle').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const toggle = document.getElementById('history-toggle');
    const isOpen = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', isOpen);
    toggle.classList.toggle('open', !isOpen);
  });

  document.getElementById('export-btn').addEventListener('click', exportWeek);
  document.addEventListener('visibilitychange', onVisibilityChange);

  wireAlternatives();
}

// ── 16. INIT ──────────────────────────────────────────────────────────────────

function renderNormalPage() {
  renderShameBar();
  renderGoals();
  renderStreakHeatmap();
  renderHistory();
  // wireAlternatives is called once inside wireEvents — not here
}

function runNormalInit() {
  incrementShameCounter();
  renderNormalPage();
  enableExitFriction();
  wireEvents();
}

function init() {
  initStorage();

  const session = getStorage('rdp_active_session');
  if (session && session.decId) {
    // Returning visit while locked in — show check-in overlay, skip shame
    showReturningOverlay(session);
    // Still wire the page underneath in case they pick "still going"
    renderNormalPage();
    transitionTo('committed');
    // Wire non-overlay events too (history, export, alts)
    wireEvents();
    return;
  }

  runNormalInit();
}

document.addEventListener('DOMContentLoaded', init);
