const STORAGE_KEY = "nine_project_mvp_v1";
const FAIL_PENALTY_POINTS = 5;
const THEME_KEY = "mission_possible_theme";

const TUTORIAL_STEPS = [
  { id: 0, title: "미션 파서블에 오신 것을 환영합니다!", description: "미루기를 방지하고 집중력을 높이는 앱입니다.\n단계별로 모든 기능을 배워보세요!" },
  { id: 1, title: "포인트 시스템", description: "세션을 완료하면 포인트를 얻습니다.\n포인트로 휴식권과 실드를 구매할 수 있어요.", target: ".muted" },
  { id: 2, title: "할 일 추가", description: "할 일 제목과 예상 시간을 입력한 후\n'추가' 버튼을 클릭하세요.", target: "#task-title" },
  { id: 3, title: "할 일 선택 및 시작", description: "오늘 목록에서 할 일을 선택한 후\n'지금 시작' 버튼을 눌러 집중 세션을 시작하세요.", target: "#start-session" },
  { id: 4, title: "집중 모드", description: "집중 모드에서는 다른 화면으로 이동할 수 없습니다.\n타이머가 끝나거나 완료 버튼으로 세션을 마칠 수 있습니다.", fullScreen: true },
  { id: 5, title: "포인트 획득", description: "세션을 완료하면 포인트를 획득합니다.\n실패하면 포인트를 잃을 수 있습니다.", fullScreen: true },
  { id: 6, title: "휴식권과 실드", description: "휴식권: 세션을 건너뛸 수 있습니다\n실드: 실패해도 포인트를 잃지 않습니다", target: "[id='buy-break']" },
  { id: 7, title: "기록 보기", description: "상단의 '기록' 탭에서\n과거 세션들을 볼 수 있습니다.", target: "[id='nav-report']" },
  { id: 8, title: "모든 기능을 배웠습니다!", description: "이제 할 일을 추가해서 시작해보세요!\n홈 화면에서 언제든 '튜토리얼' 버튼으로 다시 볼 수 있습니다." },
];

const state = loadState();
let timerId = null;
let editingTaskId = null;
let alertAudioContext = null;
let tutorialState = {
  active: false,
  currentStep: 0,
};

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
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
window.addEventListener("beforeunload", (event) => {
  if (!state.activeSession) return;
  event.preventDefault();
  event.returnValue = "";
});
document.addEventListener("pointerdown", primeAlertSound, { once: true });
document.addEventListener("keydown", primeAlertSound, { once: true });

initTheme();
init();

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  applyTheme(savedTheme === "dark");
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark-mode");
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
}

function applyTheme(isDark) {
  document.body.classList.toggle("dark-mode", isDark);
  const toggleBtn = document.getElementById("theme-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = isDark ? "라이트" : "다크";
  }
}

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
          <input id="onboard-minutes" type="number" step="1" inputmode="numeric" value="25" />
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
    if (defaultMinutes < 1) {
      alert("기본 집중 시간은 1분 이상으로 입력해주세요.");
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
        <button id="start-tutorial" class="small ghost">📖 튜토리얼</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0;">할 일 추가</h3>
      <p class="muted" style="margin: 6px 0 0;">입력이 안 된다면 새로고침하기.</p>
      <div class="row" style="justify-content: flex-end; margin: 6px 0 10px;">
        <button id="task-refresh" class="ghost">새로고침</button>
      </div>
      <div class="grid-2">
        <label>할 일 제목
          <input id="task-title" placeholder="예: 이력서 1개 항목 수정" />
        </label>
        <label>예상 시간
          <input id="task-minutes" type="number" step="1" inputmode="numeric" value="${state.settings.defaultMinutes || 25}" />
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
                <input id="edit-task-minutes" type="number" step="1" inputmode="numeric" value="${editingTask.estimatedMinutes}" />
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
    if (minutes < 1) {
      alert("예상 시간은 1분 이상으로 입력해주세요.");
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

  document.getElementById("task-refresh").addEventListener("click", renderHome);

  document.getElementById("buy-break").addEventListener("click", () => spendPoints(30, "break"));
  document.getElementById("buy-shield").addEventListener("click", () => spendPoints(40, "shield"));
  document.getElementById("start-tutorial").addEventListener("click", startTutorial);
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
  const canEarlyComplete = active.remainingSeconds > 0 && state.points >= 15;
  const earlyCompleteCost = 15;

  screens.focus.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0;">집중 실행</h2>
      <p class="muted">현재 할 일</p>
      <strong>${escapeHtml(task ? task.title : "삭제된 할 일")}</strong>
      <p class="muted">집중 중에는 다른 화면으로 이동할 수 없습니다.</p>
      <div id="timer-view" class="timer">${formatTime(active.remainingSeconds)}</div>
      <div class="row">
        <button id="pause-btn" class="ghost">${active.paused ? "재개" : "일시정지"}</button>
        <button id="complete-btn" ${active.remainingSeconds > 0 ? "disabled title=\"시간이 끝나야 완료할 수 있습니다. 15P를 사용해 조기완료하세요.\"" : ""}>완료</button>
        <button id="fail-btn" class="danger">포기/실패</button>
      </div>
      ${
        active.remainingSeconds > 0
          ? `<div class="card" style="margin-top:12px; background: rgba(100,200,255,0.1); padding: 8px; border-left: 3px solid #64c8ff;">
              <p style="margin: 0; font-size: 12px;">
                <strong>${earlyCompleteCost}P</strong>를 사용해 지금 완료할 수 있습니다.
                ${!canEarlyComplete ? `<span style="color: #ff6b6b;"> (포인트 부족: ${state.points}/${earlyCompleteCost})</span>` : ""}
              </p>
              <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                <button id="early-complete-btn" ${!canEarlyComplete ? "disabled" : ""} class="small">${earlyCompleteCost}P로 지금 완료</button>
                <span style="font-size: 12px; color: #666;">양심 껏 하세요.</span>
              </div>
            </div>`
          : ""
      }
    </div>
  `;

  document.getElementById("pause-btn").addEventListener("click", () => {
    active.paused = !active.paused;
    saveState();
    renderFocus();
  });
  document.getElementById("complete-btn").addEventListener("click", () => finishSession("success"));
  document.getElementById("fail-btn").addEventListener("click", () => finishSession("fail"));
  
  const earlyCompleteBtn = document.getElementById("early-complete-btn");
  if (earlyCompleteBtn) {
    earlyCompleteBtn.addEventListener("click", () => {
      if (state.points >= 15) {
        state.points -= 15;
        active.remainingSeconds = 0; // 남은 시간을 0으로 설정해 완료 가능하게
        saveState();
        finishSession("success");
      } else {
        alert("포인트가 부족합니다.");
      }
    });
  }
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    const active = state.activeSession;
    if (!active || active.paused) return;

    if (active.remainingSeconds <= 0) {
      finishByTimer();
      return;
    }

    active.remainingSeconds -= 1;

    if (active.remainingSeconds <= 0) {
      finishByTimer();
      return;
    }

    const timerView = document.getElementById("timer-view");
    if (timerView) {
      timerView.textContent = formatTime(active.remainingSeconds);
    }
    saveState();
  }, 1000);
}

function finishByTimer() {
  const active = state.activeSession;
  if (!active) return;

  active.remainingSeconds = 0;
  saveState();
  clearInterval(timerId);
  
  // 사운드 재생 시작
  playAlertSound();
  
  // 사운드 길이(약 800ms) 후에 알림창 표시
  setTimeout(() => {
    alert("시간이 다 됐습니다.");
  }, 850);
  
  // 알림창이 나타난 후 화면 업데이트
  setTimeout(() => {
    renderFocus();
    showResultScreen();
  }, 1000);
}

function primeAlertSound() {
  if (alertAudioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  alertAudioContext = new AudioContextClass();
  if (alertAudioContext.state === "suspended") {
    alertAudioContext.resume().catch(() => {});
  }
}

function playAlertSound() {
  primeAlertSound();
  if (!alertAudioContext) return;

  const context = alertAudioContext;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const beep = (frequency, startTime, duration, peakGain, type = "sine") => {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = 0;
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(peakGain * 0.7, startTime + duration * 0.8);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  };

  const now = context.currentTime;
  // 1000Hz 3단계 알림음
  beep(1000, now, 0.2, 0.3);        // 첫 번째 비프
  beep(1000, now + 0.25, 0.2, 0.3); // 두 번째 비프
  beep(1000, now + 0.5, 0.3, 0.35); // 세 번째 비프
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
        <div id="fail-reasons" class="check-grid">
          <label><input type="checkbox" name="fail-reason" value="집중 깨짐" /> 집중 깨짐</label>
          <label><input type="checkbox" name="fail-reason" value="시간 과소추정" /> 시간 과소추정</label>
          <label><input type="checkbox" name="fail-reason" value="난이도 높음" /> 난이도 높음</label>
          <label><input type="checkbox" name="fail-reason" value="외부 방해" /> 외부 방해</label>
        </div>
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
      <p class="muted">실드를 사용하지 않으면 포인트 ${FAIL_PENALTY_POINTS}P가 차감됩니다.</p>
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
    const failReasons =
      result === "fail"
        ? Array.from(document.querySelectorAll('input[name="fail-reason"]:checked')).map((input) => input.value)
        : [];
    const memo = document.getElementById("result-memo").value.trim();
    const useShield = result === "fail" && document.getElementById("use-shield").checked;

    if (useShield && state.shields > 0) {
      state.shields -= 1;
      logPoint("use", -40, "실드 사용");
    }

    finalizeSession(result, failReasons, memo, useShield);
  });

  showScreen("result");
}

function finishSession(presetResult) {
  if (presetResult === "success" && state.activeSession && state.activeSession.remainingSeconds > 0) {
    alert("남은 시간이 있어 15P를 사용해 조기완료하세요.");
    renderFocus();
    return;
  }
  clearInterval(timerId);
  showResultScreen(presetResult);
}

function finalizeSession(result, failReasons, memo, useShield = false) {
  const active = state.activeSession;
  if (!active) return;
  const task = state.tasks.find((t) => t.id === active.taskId);
  const normalizedFailReasons = normalizeFailReasons(failReasons);

  state.sessions.push({
    id: active.id,
    taskId: active.taskId,
    startAt: active.startAt,
    endAt: new Date().toISOString(),
    plannedMinutes: active.plannedMinutes,
    result,
    failReasons: normalizedFailReasons,
    failReason: normalizedFailReasons[0] || "",
    memo: memo || "",
  });

  if (task) {
    task.status = result === "success" ? "done" : "todo";
  }

  if (result === "success") {
    state.points += 10;
    logPoint("earn", 10, "집중 세션 완료");
  } else if (!useShield) {
    const penalty = Math.min(state.points, FAIL_PENALTY_POINTS);
    state.points -= penalty;
    if (penalty > 0) {
      logPoint("use", -penalty, "실패 페널티");
    }
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
      const reasons = normalizeFailReasons(s.failReasons || s.failReason);
      if (!reasons.length) {
        failCounts["미입력"] = (failCounts["미입력"] || 0) + 1;
        return;
      }
      reasons.forEach((reason) => {
        failCounts[reason] = (failCounts[reason] || 0) + 1;
      });
    });

  const topFails = Object.entries(failCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const recentLedger = [...state.pointLedger].reverse().slice(0, 8);

  screens.report.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 8px;">
        <h2 style="margin:0;">기록</h2>
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
              .map((l) => `<li>${formatKoreanDateTime(new Date(l.createdAt))} · ${l.reason} · ${l.amount > 0 ? "+" : ""}${l.amount}P</li>`)
              .join("")}</ul>`
          : `<p class="muted">포인트 내역이 없습니다.</p>`
      }
    </div>

    <div class="card">
      <h3 style="margin-top:0;">다음 주 목표</h3>
      <div class="row">
        <input id="next-week-goal-input" type="number" value="${state.settings.nextWeekGoal || ""}" placeholder="목표 입력" style="max-width:140px;" />
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
  if (state.activeSession && key !== "focus" && key !== "result") {
    key = "focus";
  }
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle("hidden", k !== key);
  });
  syncTopNav(key);
}

function syncTopNav(screenKey) {
  const homeBtn = document.getElementById("nav-home");
  const reportBtn = document.getElementById("nav-report");
  if (!homeBtn || !reportBtn) return;

  const locked = Boolean(state.activeSession);
  homeBtn.disabled = locked && screenKey !== "home";
  reportBtn.disabled = locked && screenKey !== "report";
  homeBtn.title = locked ? "집중 세션이 끝나면 이동할 수 있습니다." : "";
  reportBtn.title = locked ? "집중 세션이 끝나면 이동할 수 있습니다." : "";
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
    let needsSave = false;
    if (!parsed.settings) parsed.settings = {};
    if (!parsed.settings.dailyGoal) {
      parsed.settings.dailyGoal = 2;
      needsSave = true;
    }
    if (!Number.isFinite(parsed.settings.defaultMinutes) || parsed.settings.defaultMinutes < 1) {
      parsed.settings.defaultMinutes = 25;
      needsSave = true;
    }
    if (typeof parsed.settings.notifications !== "boolean") {
      parsed.settings.notifications = true;
      needsSave = true;
    }
    if (!parsed.report) {
      parsed.report = { mode: "week", offset: 0 };
      needsSave = true;
    }
    if (!Array.isArray(parsed.tasks)) {
      parsed.tasks = [];
      needsSave = true;
    }
    parsed.tasks.forEach((task, index) => {
      if (typeof task.order !== "number") {
        task.order = index;
        needsSave = true;
      }
      if (!Number.isFinite(task.estimatedMinutes) || task.estimatedMinutes < 1) {
        task.estimatedMinutes = 5;
        needsSave = true;
      }
    });
    if (!("selectedTaskId" in parsed)) {
      parsed.selectedTaskId = null;
      needsSave = true;
    }
    if (typeof parsed.breakTokens !== "number") {
      parsed.breakTokens = 0;
      needsSave = true;
    }
    if (typeof parsed.shields !== "number") {
      parsed.shields = 0;
      needsSave = true;
    }
    if (!Array.isArray(parsed.pointLedger)) {
      parsed.pointLedger = [];
      needsSave = true;
    }
    if (needsSave) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
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
  const raw = input.value.trim();
  if (!raw) {
    alert("목표를 입력해주세요.");
    return;
  }
  const goal = Number(raw);
  if (!Number.isFinite(goal)) {
    alert("목표는 숫자로 입력해주세요.");
    return;
  }
  state.settings.nextWeekGoal = Math.round(goal);
  saveState();
}

// 튜토리얼 함수들
function startTutorial() {
  tutorialState.active = true;
  tutorialState.currentStep = 0;
  showTutorialStep();
}

function showTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialState.currentStep];
  if (!step) {
    endTutorial();
    return;
  }

  // 기존 오버레이 제거
  const existing = document.getElementById("tutorial-overlay");
  if (existing) existing.remove();

  // 오버레이 생성
  const overlay = document.createElement("div");
  overlay.id = "tutorial-overlay";
  overlay.className = "tutorial-overlay";

  // 풀스크린 모드 또는 타겟 요소 하이라이트
  if (step.fullScreen) {
    overlay.classList.add("full-screen");
  } else if (step.target) {
    const target = document.querySelector(step.target);
    if (target) {
      const rect = target.getBoundingClientRect();
      const highlight = document.createElement("div");
      highlight.className = "tutorial-highlight";
      highlight.style.top = rect.top + window.scrollY + "px";
      highlight.style.left = rect.left + "px";
      highlight.style.width = rect.width + "px";
      highlight.style.height = rect.height + "px";
      overlay.appendChild(highlight);
    }
  }

  // 설명 모달
  const modal = document.createElement("div");
  modal.className = "tutorial-modal";

  const isLast = tutorialState.currentStep === TUTORIAL_STEPS.length - 1;
  const isFirst = tutorialState.currentStep === 0;

  modal.innerHTML = `
    <div class="tutorial-content">
      <h2 style="margin-top: 0;">${step.title}</h2>
      <p>${step.description.replace(/\n/g, "<br>")}</p>
      <div class="tutorial-progress">
        ${tutorialState.currentStep + 1} / ${TUTORIAL_STEPS.length}
      </div>
      <div class="row" style="gap: 8px; margin-top: 16px;">
        ${!isFirst ? '<button id="tutorial-prev" class="small">이전</button>' : ''}
        <button id="tutorial-skip" class="small ghost">건너뛰기</button>
        ${!isLast ? '<button id="tutorial-next" class="small">다음</button>' : '<button id="tutorial-finish" class="small">완료</button>'}
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // 이벤트 리스너
  if (!isFirst) {
    document.getElementById("tutorial-prev").addEventListener("click", prevTutorialStep);
  }
  document.getElementById("tutorial-skip").addEventListener("click", endTutorial);
  
  if (isLast) {
    document.getElementById("tutorial-finish").addEventListener("click", endTutorial);
  } else {
    document.getElementById("tutorial-next").addEventListener("click", nextTutorialStep);
  }

  // 오버레이 클릭으로 다음 단계
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !step.fullScreen) {
      nextTutorialStep();
    }
  });
}

function nextTutorialStep() {
  if (tutorialState.currentStep < TUTORIAL_STEPS.length - 1) {
    tutorialState.currentStep++;
    showTutorialStep();
  }
}

function prevTutorialStep() {
  if (tutorialState.currentStep > 0) {
    tutorialState.currentStep--;
    showTutorialStep();
  }
}

function endTutorial() {
  tutorialState.active = false;
  const overlay = document.getElementById("tutorial-overlay");
  if (overlay) overlay.remove();
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
  if (minutes < 1) {
    alert("시간은 1분 이상으로 입력해주세요.");
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
      label: formatKoreanDate(day),
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
    label: `${formatKoreanShortDate(base)} - ${formatKoreanShortDate(end)}`,
  };
}

function formatKoreanDate(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatKoreanShortDate(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatKoreanDateTime(d) {
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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

function normalizeFailReasons(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const single = value.trim();
    return single ? [single] : [];
  }
  return [];
}
