const STORAGE_KEY = "nine_project_mvp_v1";

const state = loadState();
let timerId = null;
let editingTaskId = null;

const screens = {
  onboarding: document.getElementById("screen-onboarding"),
  home: document.getElementById("screen-home"),
  focus: document.getElementById("screen-focus"),
  result: document.getElementById("screen-result"),
  report: document.getElementById("screen-report"),
};

document.getElementById("nav-home").addEventListener("click", () => showScreen("home"));
document.getElementById("nav-report").addEventListener("click", () => {
  renderReport();
  showScreen("report");
});

init();

function init() {
  if (!state.settings.onboarded) {
    renderOnboarding();
    showScreen("onboarding");
    return;
  }

  if (state.activeSession) {
    renderFocus();
    showScreen("focus");
    startTimer();
  } else {
    renderHome();
    showScreen("home");
  }
}

function renderOnboarding() {
  screens.onboarding.innerHTML = `
    <div class="card">
      <h2>시작 설정</h2>
      <p class="muted">오늘 바로 1회 집중 세션을 시작할 수 있게 최소 설정만 받습니다.</p>
      <div class="grid-2">
        <label>오늘 목표 개수
          <input id="onboard-goal" type="number" min="1" max="10" value="2" />
        </label>
        <label>기본 집중 시간
          <input id="onboard-minutes" type="number" value="25" />
        </label>
      </div>
      <label style="display:block; margin-top:8px;">
        <input id="onboard-notify" type="checkbox" checked />
        알림 받기
      </label>
      <div class="row" style="margin-top:12px;">
        <button id="onboard-start">시작하기</button>
      </div>
    </div>
  `;

  document.getElementById("onboard-start").addEventListener("click", () => {
    const dailyGoal = Number(document.getElementById("onboard-goal").value);
    const defaultMinutes = Number(document.getElementById("onboard-minutes").value);
    if (!Number.isFinite(dailyGoal) || dailyGoal < 1 || dailyGoal > 10) {
      alert("오늘 목표 개수는 1~10 사이로 입력해주세요.");
      return;
    }
    if (!Number.isFinite(defaultMinutes)) {
      alert("기본 집중 시간은 숫자로 입력해주세요.");
      return;
    }

    state.settings = {
      onboarded: true,
      dailyGoal: Math.round(dailyGoal),
      defaultMinutes: Math.round(defaultMinutes),
      notifications: document.getElementById("onboard-notify").checked,
    };
    saveState();
    renderHome();
    showScreen("home");
  });
}

function renderHome() {
  const today = isoDate(new Date());
  const todaysTasks = getTodayTasks(today);
  const completedToday = state.sessions.filter((s) => isoDate(new Date(s.endAt)) === today && s.result === "success").length;
  const editingTask = state.tasks.find((t) => t.id === editingTaskId) || null;

  if (!state.selectedTaskId || !todaysTasks.some((t) => t.id === state.selectedTaskId)) {
    state.selectedTaskId = todaysTasks.length ? todaysTasks[0].id : null;
    saveState();
  }

  const selectedTask = todaysTasks.find((t) => t.id === state.selectedTaskId);

  screens.home.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content: space-between;">
        <h2 style="margin:0;">오늘의 할 일</h2>
        <span class="badge">완료 ${completedToday}/${state.settings.dailyGoal || 2}</span>
      </div>
      <p class="muted">포인트: <strong>${state.points}</strong>P | 휴식권: ${state.breakTokens} | 실드: ${state.shields}</p>
      <div class="row">
        <button id="buy-break" class="small ghost">30P로 휴식권 구매</button>
        <button id="buy-shield" class="small ghost">40P로 실드 구매</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">할 일 추가</h3>
      <div class="grid-2">
        <label>할 일 제목
          <input id="task-title" placeholder="예: 이력서 1개 항목 수정" />
        </label>
        <label>예상 시간
          <input id="task-minutes" type="number" value="${state.settings.defaultMinutes || 25}" />
        </label>
      </div>
      <label style="margin-top:8px; display:block;">우선순위
        <select id="task-priority">
          <option value="high">높음</option>
          <option value="medium" selected>보통</option>
          <option value="low">낮음</option>
        </select>
      </label>
      <div class="row" style="margin-top:12px;">
        <button id="task-add">추가</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">오늘 목록</h3>
      <div id="task-list"></div>
    </div>

    ${
      editingTask
        ? `
          <div class="card">
            <h3 style="margin-top:0;">할 일 수정</h3>
            <div class="grid-2">
              <label>할 일 제목
                <input id="edit-task-title" value="${escapeAttr(editingTask.title)}" />
              </label>
              <label>예상 시간
                <input id="edit-task-minutes" type="number" value="${editingTask.estimatedMinutes}" />
              </label>
            </div>
            <label style="margin-top:8px; display:block;">우선순위
              <select id="edit-task-priority">
                <option value="high" ${editingTask.priority === "high" ? "selected" : ""}>높음</option>
                <option value="medium" ${editingTask.priority === "medium" ? "selected" : ""}>보통</option>
                <option value="low" ${editingTask.priority === "low" ? "selected" : ""}>낮음</option>
              </select>
            </label>
            <div class="row" style="margin-top:10px;">
              <button id="save-task-edit" class="small">저장</button>
              <button id="cancel-task-edit" class="small ghost">취소</button>
            </div>
          </div>
        `
        : ""
    }

    <div class="start-dock">
      <div class="muted">선택된 할 일: ${selectedTask ? escapeHtml(selectedTask.title) : "없음"}</div>
      <button id="start-selected" ${selectedTask ? "" : "disabled"}>지금 시작</button>
    </div>
  `;

  document.getElementById("task-add").addEventListener("click", () => {
    const title = document.getElementById("task-title").value.trim();
    const minutes = Number(document.getElementById("task-minutes").value);
    if (!title) return;
    if (!Number.isFinite(minutes)) {
      alert("예상 시간은 숫자로 입력해주세요.");
      return;
    }

    state.tasks.push({
      id: uid(),
      title,
      estimatedMinutes: Math.round(minutes),
      priority: document.getElementById("task-priority").value,
      status: "todo",
      createdAt: new Date().toISOString(),
      scheduledDate: isoDate(new Date()),
    });
    saveState();
    renderHome();
  });

  document.getElementById("buy-break").addEventListener("click", () => spendPoints(30, "break"));
  document.getElementById("buy-shield").addEventListener("click", () => spendPoints(40, "shield"));
  document.getElementById("start-selected").addEventListener("click", () => {
    if (state.selectedTaskId) startFocus(state.selectedTaskId);
  });

  if (editingTask) {
    document.getElementById("save-task-edit").addEventListener("click", saveTaskEdit);
    document.getElementById("cancel-task-edit").addEventListener("click", () => {
      editingTaskId = null;
      renderHome();
    });
  }

  const list = document.getElementById("task-list");
  if (!todaysTasks.length) {
    list.innerHTML = `<p class="muted">오늘 할 일이 없습니다. 하나 추가해보세요.</p>`;
    return;
  }

  list.innerHTML = todaysTasks
    .map(
      (task) => `
        <div class="task-item ${task.id === state.selectedTaskId ? "selected" : ""}" data-action="select" data-id="${task.id}">
          <div>
            <strong>${escapeHtml(task.title)}</strong>
            <div class="muted">${task.estimatedMinutes}분 · ${priorityLabel(task.priority)}</div>
          </div>
          <div class="row">
            <button class="small ghost" data-action="up" data-id="${task.id}">위</button>
            <button class="small ghost" data-action="down" data-id="${task.id}">아래</button>
            <button class="small ghost" data-action="edit" data-id="${task.id}">수정</button>
            <button class="small ghost" data-action="delete" data-id="${task.id}">삭제</button>
          </div>
        </div>
      `
    )
    .join("");

  list.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "up") {
        moveTaskOrder(id, -1, today);
        renderHome();
        return;
      }
      if (action === "down") {
        moveTaskOrder(id, 1, today);
        renderHome();
        return;
      }
      if (action === "edit") {
        editingTaskId = id;
        renderHome();
        return;
      }
      if (action === "delete") {
        state.tasks = state.tasks.filter((t) => t.id !== id);
        if (editingTaskId === id) editingTaskId = null;
        if (state.selectedTaskId === id) state.selectedTaskId = null;
        saveState();
        renderHome();
        return;
      }
    });
  });

  list.querySelectorAll(".task-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.tagName === "BUTTON") return;
      const id = item.dataset.id;
      state.selectedTaskId = id;
      saveState();
      renderHome();
    });
  });
}

function startFocus(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  editingTaskId = null;

  task.status = "in-progress";
  state.activeSession = {
    id: uid(),
    taskId,
    plannedMinutes: task.estimatedMinutes,
    remainingSeconds: task.estimatedMinutes * 60,
    startAt: new Date().toISOString(),
    paused: false,
  };

  saveState();
  renderFocus();
  showScreen("focus");
  startTimer();
}

function renderFocus() {
  const active = state.activeSession;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);

  screens.focus.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">집중 실행</h2>
      <p class="muted">현재 할 일</p>
      <strong>${escapeHtml(task ? task.title : "삭제된 할 일")}</strong>
      <div id="timer-view" class="timer">${formatTime(active.remainingSeconds)}</div>
      <div class="row">
        <button id="pause-btn" class="ghost">${active.paused ? "재개" : "일시정지"}</button>
        <button id="complete-btn">완료</button>
        <button id="fail-btn" class="danger">포기/실패</button>
      </div>
    </div>
  `;

  document.getElementById("pause-btn").addEventListener("click", () => {
    active.paused = !active.paused;
    saveState();
    renderFocus();
  });
  document.getElementById("complete-btn").addEventListener("click", () => finishSession("success"));
  document.getElementById("fail-btn").addEventListener("click", () => finishSession("fail"));
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    const active = state.activeSession;
    if (!active || active.paused) return;
    active.remainingSeconds -= 1;

    if (active.remainingSeconds <= 0) {
      active.remainingSeconds = 0;
      saveState();
      clearInterval(timerId);
      renderFocus();
      showResultScreen();
      return;
    }

    const timerView = document.getElementById("timer-view");
    if (timerView) {
      timerView.textContent = formatTime(active.remainingSeconds);
    }
    saveState();
  }, 1000);
}

function showResultScreen(presetResult) {
  const active = state.activeSession;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);

  screens.result.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">세션 결과</h2>
      <p><strong>${escapeHtml(task ? task.title : "삭제된 할 일")}</strong> · ${active.plannedMinutes}분</p>
      <label>결과
        <select id="result-type">
          <option value="success" ${presetResult === "success" ? "selected" : ""}>완료</option>
          <option value="fail" ${presetResult === "fail" ? "selected" : ""}>실패</option>
        </select>
      </label>
      <label id="fail-reason-wrap" style="display:block; margin-top:8px;">
        실패 사유
        <select id="fail-reason">
          <option value="집중 깨짐">집중 깨짐</option>
          <option value="시간 과소추정">시간 과소추정</option>
          <option value="난이도 높음">난이도 높음</option>
        </select>
      </label>
      <label style="display:block; margin-top:8px;">
        메모(선택)
        <textarea id="result-memo" rows="3" placeholder="세션 메모"></textarea>
      </label>
      <div class="row" style="margin-top:10px;">
        <button id="save-result">저장</button>
      </div>
    </div>

    <div class="card" id="fail-actions-card">
      <h3 style="margin-top:0;">실패 시 바로 조정</h3>
      <div class="row">
        <button id="split-task" class="small ghost">할 일 쪼개기</button>
        <button id="extend-task" class="small ghost">+10분 연장</button>
        <button id="reschedule-task" class="small ghost">내일로 미루기</button>
      </div>
      <label style="display:block; margin-top:8px;">
        <input id="use-shield" type="checkbox" ${state.shields > 0 ? "" : "disabled"} />
        실드 사용(보유 ${state.shields}개)
      </label>
    </div>
  `;

  const resultType = document.getElementById("result-type");
  const failWrap = document.getElementById("fail-reason-wrap");
  const failCard = document.getElementById("fail-actions-card");

  const syncFailUi = () => {
    const isFail = resultType.value === "fail";
    failWrap.style.display = isFail ? "block" : "none";
    failCard.style.display = isFail ? "block" : "none";
  };

  resultType.addEventListener("change", syncFailUi);
  syncFailUi();

  document.getElementById("split-task").addEventListener("click", () => splitTask(active.taskId));
  document.getElementById("extend-task").addEventListener("click", () => extendTask(active.taskId, 10));
  document.getElementById("reschedule-task").addEventListener("click", () => rescheduleTask(active.taskId, 1));

  document.getElementById("save-result").addEventListener("click", () => {
    const result = resultType.value;
    const failReason = result === "fail" ? document.getElementById("fail-reason").value : "";
    const memo = document.getElementById("result-memo").value.trim();
    const useShield = result === "fail" && document.getElementById("use-shield").checked;

    if (useShield && state.shields > 0) {
      state.shields -= 1;
      logPoint("use", -40, "실드 사용");
    }

    finalizeSession(result, failReason, memo);
  });

  showScreen("result");
}

function finishSession(presetResult) {
  clearInterval(timerId);
  showResultScreen(presetResult);
}

function finalizeSession(result, failReason, memo) {
  const active = state.activeSession;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);

  state.sessions.push({
    id: active.id,
    taskId: active.taskId,
    startAt: active.startAt,
    endAt: new Date().toISOString(),
    plannedMinutes: active.plannedMinutes,
    result,
    failReason: failReason || "",
    memo: memo || "",
  });

  if (task) {
    task.status = result === "success" ? "done" : "todo";
  }

  if (result === "success") {
    state.points += 10;
    logPoint("earn", 10, "집중 세션 완료");
  }

  state.activeSession = null;
  saveState();

  renderHome();
  showScreen("home");
}

function renderReport() {
  const reportMode = state.report?.mode || "week";
  const reportOffset = state.report?.offset || 0;
  const range = getReportRange(reportMode, reportOffset);
  const periodSessions = state.sessions.filter((s) => {
    const time = new Date(s.endAt);
    return time >= range.start && time <= range.end;
  });

  const total = periodSessions.length;
  const success = periodSessions.filter((s) => s.result === "success").length;
  const completionRate = total ? Math.round((success / total) * 100) : 0;

  const failCounts = {};
  periodSessions
    .filter((s) => s.result === "fail")
    .forEach((s) => {
      failCounts[s.failReason] = (failCounts[s.failReason] || 0) + 1;
    });

  const topFails = Object.entries(failCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const recentLedger = [...state.pointLedger].reverse().slice(0, 8);

  screens.report.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <h2 style="margin:0;">리포트</h2>
        <div class="row">
          <button id="mode-day" class="small ${reportMode === "day" ? "" : "ghost"}">일</button>
          <button id="mode-week" class="small ${reportMode === "week" ? "" : "ghost"}">주</button>
        </div>
      </div>
      <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
        <button id="period-prev" class="small ghost">이전</button>
        <strong>${escapeHtml(range.label)}</strong>
        <button id="period-next" class="small ghost" ${reportOffset === 0 ? "disabled" : ""}>다음</button>
      </div>
      <div class="kpis">
        <div class="kpi"><span class="muted">완료 세션</span><strong>${success}</strong></div>
        <div class="kpi"><span class="muted">전체 세션</span><strong>${total}</strong></div>
        <div class="kpi"><span class="muted">완료율</span><strong>${completionRate}%</strong></div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">실패 사유 상위</h3>
      ${
        topFails.length
          ? `<ul class="list">${topFails.map(([reason, count]) => `<li>${escapeHtml(reason)}: ${count}회</li>`).join("")}</ul>`
          : `<p class="muted">아직 실패 데이터가 없습니다.</p>`
      }
    </div>

    <div class="card">
      <h3 style="margin-top:0;">포인트 내역</h3>
      ${
        recentLedger.length
          ? `<ul class="list">${recentLedger
              .map((l) => `<li>${new Date(l.createdAt).toLocaleString()} · ${l.reason} · ${l.amount > 0 ? "+" : ""}${l.amount}P</li>`)
              .join("")}</ul>`
          : `<p class="muted">포인트 내역이 없습니다.</p>`
      }
    </div>

    <div class="card">
      <h3 style="margin-top:0;">다음 주 목표</h3>
      <p class="muted">현재 설정: 하루 ${state.settings.nextWeekGoal || state.settings.dailyGoal || 2}개</p>
      <div class="row">
        <input id="next-week-goal-input" type="number" min="1" max="10" value="${state.settings.nextWeekGoal || state.settings.dailyGoal || 2}" style="max-width:120px;" />
        <button id="set-next-goal" class="small">목표 저장</button>
      </div>
    </div>
  `;

  document.getElementById("mode-day").addEventListener("click", () => setReportMode("day"));
  document.getElementById("mode-week").addEventListener("click", () => setReportMode("week"));
  document.getElementById("period-prev").addEventListener("click", () => shiftReportOffset(1));
  document.getElementById("period-next").addEventListener("click", () => shiftReportOffset(-1));
  document.getElementById("set-next-goal").addEventListener("click", setNextWeekGoal);
}

function showScreen(key) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle("hidden", k !== key);
  });
  syncTopNav(key);
}

function syncTopNav(screenKey) {
  const homeBtn = document.getElementById("nav-home");
  const reportBtn = document.getElementById("nav-report");
  if (!homeBtn || !reportBtn) return;

  homeBtn.classList.toggle("active", screenKey === "home");
  reportBtn.classList.toggle("active", screenKey === "report");
}

function spendPoints(cost, type) {
  if (state.points < cost) {
    alert("포인트가 부족합니다.");
    return;
  }

  state.points -= cost;
  if (type === "break") state.breakTokens += 1;
  if (type === "shield") state.shields += 1;
  logPoint("use", -cost, type === "break" ? "휴식권 구매" : "실드 구매");
  saveState();
  renderHome();
}

function splitTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const m = Math.max(10, task.estimatedMinutes);
  const first = Math.max(5, Math.floor(m / 2));
  const second = Math.max(5, m - first);
  task.title = `${task.title} (1/2)`;
  task.estimatedMinutes = first;
  state.tasks.push({
    ...task,
    id: uid(),
    title: task.title.replace("(1/2)", "(2/2)"),
    estimatedMinutes: second,
    status: "todo",
    createdAt: new Date().toISOString(),
  });
  saveState();
  alert("할 일을 2개로 쪼갰습니다.");
}

function extendTask(taskId, minutes) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.estimatedMinutes += minutes;
  saveState();
  alert(`예상 시간을 ${minutes}분 연장했습니다.`);
}

function rescheduleTask(taskId, days) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const d = new Date(task.scheduledDate);
  d.setDate(d.getDate() + days);
  task.scheduledDate = isoDate(d);
  saveState();
  alert("내일 할 일로 이동했습니다.");
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (!parsed.settings) parsed.settings = {};
    if (!parsed.settings.dailyGoal) parsed.settings.dailyGoal = 2;
    if (!parsed.settings.defaultMinutes) parsed.settings.defaultMinutes = 25;
    if (typeof parsed.settings.notifications !== "boolean") parsed.settings.notifications = true;
    if (!parsed.report) parsed.report = { mode: "week", offset: 0 };
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    parsed.tasks.forEach((task, index) => {
      if (typeof task.order !== "number") task.order = index;
    });
    if (!("selectedTaskId" in parsed)) parsed.selectedTaskId = null;
    if (typeof parsed.breakTokens !== "number") parsed.breakTokens = 0;
    if (typeof parsed.shields !== "number") parsed.shields = 0;
    if (!Array.isArray(parsed.pointLedger)) parsed.pointLedger = [];
    return parsed;
  }
  return {
    settings: {
      onboarded: false,
      dailyGoal: 2,
      defaultMinutes: 25,
      notifications: true,
      nextWeekGoal: 2,
    },
    tasks: [],
    sessions: [],
    points: 0,
    breakTokens: 0,
    shields: 0,
    pointLedger: [],
    activeSession: null,
    selectedTaskId: null,
    report: {
      mode: "week",
      offset: 0,
    },
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function logPoint(changeType, amount, reason) {
  state.pointLedger.push({
    id: uid(),
    changeType,
    amount,
    reason,
    createdAt: new Date().toISOString(),
  });
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function daysDiff(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function priorityLabel(priority) {
  if (priority === "high") return "우선순위 높음";
  if (priority === "low") return "우선순위 낮음";
  return "우선순위 보통";
}

function getTodayTasks(today) {
  return state.tasks
    .filter((t) => t.scheduledDate === today && t.status !== "done")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function moveTaskOrder(taskId, direction, today) {
  const tasks = getTodayTasks(today);
  const index = tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= tasks.length) return;

  const current = tasks[index];
  const target = tasks[targetIndex];
  const currentOrder = current.order ?? index;
  current.order = target.order ?? targetIndex;
  target.order = currentOrder;
  saveState();
}

function editTask(taskId) {
  editingTaskId = taskId;
  renderHome();
}

function setReportMode(mode) {
  state.report.mode = mode;
  state.report.offset = 0;
  saveState();
  renderReport();
}

function shiftReportOffset(delta) {
  const nextOffset = (state.report.offset || 0) + delta;
  state.report.offset = Math.max(0, nextOffset);
  saveState();
  renderReport();
}

function setNextWeekGoal() {
  const input = document.getElementById("next-week-goal-input");
  if (!input) return;
  const goal = Number(input.value);
  if (!Number.isFinite(goal) || goal < 1 || goal > 10) {
    alert("1~10 사이 숫자를 입력해주세요.");
    return;
  }
  state.settings.nextWeekGoal = Math.round(goal);
  saveState();
  renderReport();
}

function saveTaskEdit() {
  const task = state.tasks.find((t) => t.id === editingTaskId);
  if (!task) return;

  const titleInput = document.getElementById("edit-task-title");
  const minutesInput = document.getElementById("edit-task-minutes");
  const priorityInput = document.getElementById("edit-task-priority");
  if (!titleInput || !minutesInput || !priorityInput) return;

  const title = titleInput.value.trim();
  const minutes = Number(minutesInput.value);
  const priority = priorityInput.value;

  if (!title) {
    alert("할 일 제목을 입력해주세요.");
    return;
  }
  if (!Number.isFinite(minutes)) {
    alert("시간은 숫자로 입력해주세요.");
    return;
  }
  if (!["high", "medium", "low"].includes(priority)) {
    alert("우선순위는 high, medium, low 중 하나여야 합니다.");
    return;
  }

  task.title = title;
  task.estimatedMinutes = Math.round(minutes);
  task.priority = priority;
  editingTaskId = null;
  saveState();
  renderHome();
}

function getReportRange(mode, offset) {
  const now = new Date();
  if (mode === "day") {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    return {
      start: day,
      end,
      label: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
    };
  }

  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const day = base.getDay();
  const diffToMonday = (day + 6) % 7;
  base.setDate(base.getDate() - diffToMonday - offset * 7);
  const end = new Date(base);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: base,
    end,
    label: `${base.getMonth() + 1}/${base.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#96;");
}
