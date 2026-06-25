import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const configModule = await import("./firebase-config.js").catch(() => null);
const firebaseConfig = configModule?.firebaseConfig;
const caseDocumentPath = configModule?.caseDocumentPath || "teacherCases/caso1";

const appRoot = document.querySelector("#app");
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const loginError = document.querySelector("#loginError");
const phaseList = document.querySelector("#phaseList");
const phasePane = document.querySelector("#phasePane");
const activityPane = document.querySelector("#activityPane");
const materialsPane = document.querySelector("#materialsPane");
const progressText = document.querySelector("#progressText");
const progressBar = document.querySelector("#progressBar");
const sessionSummary = document.querySelector("#sessionSummary");
const toast = document.querySelector("#toast");
const caseEyebrow = document.querySelector("#caseEyebrow");
const caseTitle = document.querySelector("#caseTitle");
const caseSubtitle = document.querySelector("#caseSubtitle");

const storageKey = "ceu-mi-caso1-public-ui-v1";
let firebaseApp = null;
let auth = null;
let db = null;
let caseData = null;
let timerHandle = null;
let toastHandle = null;
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return {
      session: "all",
      phaseId: "",
      completed: {},
      timer: { phaseId: "", remaining: 0, running: false },
      answers: {},
      teamName: "",
      ...saved
    };
  } catch {
    return {
      session: "all",
      phaseId: "",
      completed: {},
      timer: { phaseId: "", remaining: 0, running: false },
      answers: {},
      teamName: ""
    };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function clearLoginFields() {
  loginForm.reset();
  emailInput.value = "";
  passwordInput.value = "";
}

function setLocked(isLocked) {
  appRoot.classList.toggle("is-locked", isLocked);
  loginScreen.classList.toggle("is-hidden", !isLocked);
  if (isLocked) {
    clearLoginFields();
    emailInput.focus();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function listItems(items) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return `<p class="microcopy">Sin indicaciones específicas.</p>`;
  return `<ul>${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function guidePanel(title, items, tone = "") {
  return `
    <div class="info-block ${tone}">
      <h3>${escapeHtml(title)}</h3>
      ${listItems(items)}
    </div>
  `;
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, totalSeconds || 0);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  if (toastHandle) clearTimeout(toastHandle);
  toastHandle = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function getPhases() {
  return Array.isArray(caseData?.phases) ? caseData.phases : [];
}

function currentPhase() {
  return getPhases().find((phase) => phase.id === state.phaseId) || getPhases()[0] || null;
}

function filteredPhases() {
  const phases = getPhases();
  if (state.session === "all") return phases;
  return phases.filter((phase) => String(phase.session) === String(state.session));
}

function ensureTimerForPhase(phase) {
  if (!phase) return;
  if (state.timer.phaseId !== phase.id) {
    state.timer = {
      phaseId: phase.id,
      remaining: Number(phase.minutes || 0) * 60,
      running: false
    };
    stopTimer();
    saveState();
  }
}

function render() {
  if (!caseData) {
    renderEmptyState();
    return;
  }

  if (!state.phaseId || !getPhases().some((phase) => phase.id === state.phaseId)) {
    state.phaseId = getPhases()[0]?.id || "";
    saveState();
  }

  const phase = currentPhase();
  ensureTimerForPhase(phase);

  caseEyebrow.textContent = caseData.eyebrow || "Medicina Integrada I";
  caseTitle.textContent = caseData.title || "Caso docente";
  caseSubtitle.textContent = caseData.subtitle || "Guía docente paso a paso";

  document
    .querySelectorAll("[data-session-button]")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.sessionButton === state.session));

  renderProgress();
  renderPhaseList();
  renderPhasePane(phase);
  renderActivity(phase);
  renderMaterials(phase);
}

function renderEmptyState() {
  caseTitle.textContent = "Contenido no cargado";
  caseSubtitle.textContent = "Revisa Firebase Auth, Firestore y las reglas de acceso.";
  phaseList.innerHTML = "";
  progressText.textContent = "0 fases";
  progressBar.style.width = "0%";
  sessionSummary.textContent = "";
  phasePane.innerHTML = `
    <div class="phase-body">
      <div class="setup-warning">
        No se ha podido cargar el documento protegido <strong>${escapeHtml(caseDocumentPath)}</strong>.
        Comprueba que existe en Firestore y que el usuario autenticado tiene permiso de lectura.
      </div>
    </div>
  `;
  activityPane.innerHTML = "";
  materialsPane.innerHTML = "";
}

function renderProgress() {
  const phases = getPhases();
  const done = phases.filter((phase) => state.completed[phase.id]).length;
  progressText.textContent = `${done} de ${phases.length} fases`;
  progressBar.style.width = phases.length ? `${Math.round((done / phases.length) * 100)}%` : "0%";

  const s1 = phases.filter((phase) => Number(phase.session) === 1).reduce((sum, phase) => sum + Number(phase.minutes || 0), 0);
  const s2 = phases.filter((phase) => Number(phase.session) === 2).reduce((sum, phase) => sum + Number(phase.minutes || 0), 0);
  sessionSummary.textContent = `Sesión 1: ${s1} min. Sesión 2: ${s2} min.`;
}

function renderPhaseList() {
  const list = filteredPhases();
  if (!list.some((phase) => phase.id === state.phaseId)) {
    state.phaseId = list[0]?.id || getPhases()[0]?.id || "";
    saveState();
  }

  phaseList.innerHTML = list
    .map((phase) => {
      const complete = Boolean(state.completed[phase.id]);
      return `
        <button type="button" class="phase-button ${phase.id === state.phaseId ? "is-current" : ""} ${
          complete ? "is-complete" : ""
        }" data-phase-id="${escapeHtml(phase.id)}">
          <span class="phase-dot">${complete ? "✓" : escapeHtml(phase.number || "")}</span>
          <span>
            <span class="phase-title">${escapeHtml(phase.title)}</span>
            <span class="phase-meta">Sesión ${escapeHtml(phase.session)} · ${escapeHtml(phase.type)}</span>
          </span>
          <span class="duration-pill">${escapeHtml(phase.minutes)} min</span>
        </button>
      `;
    })
    .join("");
}

function renderPhasePane(phase) {
  if (!phase) return;
  const phases = getPhases();
  const index = phases.findIndex((item) => item.id === phase.id);
  const previous = phases[index - 1];
  const next = phases[index + 1];

  phasePane.innerHTML = `
    <div class="phase-header">
      <div>
        <div class="phase-kicker">
          <span class="tag">Sesión ${escapeHtml(phase.session)}</span>
          <span class="tag">${escapeHtml(phase.type)}</span>
          <span class="duration-pill">${escapeHtml(phase.minutes)} min</span>
        </div>
        <h2>${escapeHtml(phase.title)}</h2>
        <p>${escapeHtml(phase.objective)}</p>
        <div class="button-row">
          <button type="button" class="control-button" data-go-phase="${escapeHtml(previous?.id || "")}" ${
            previous ? "" : "disabled"
          }>Anterior</button>
          <button type="button" class="primary-button" data-complete-phase="${escapeHtml(phase.id)}">
            ${state.completed[phase.id] ? "Marcar pendiente" : "Marcar hecha"}
          </button>
          <button type="button" class="control-button" data-go-phase="${escapeHtml(next?.id || "")}" ${
            next ? "" : "disabled"
          }>Siguiente</button>
        </div>
      </div>

      <div class="timer-box" aria-label="Temporizador de fase">
        <span class="pane-label">Temporizador</span>
        <span class="timer-display" id="timerDisplay">${formatTime(state.timer.remaining)}</span>
        <div class="timer-controls">
          <button type="button" class="primary-button" data-timer-start>Iniciar</button>
          <button type="button" class="control-button" data-timer-pause>Pausar</button>
          <button type="button" class="quiet-button" data-timer-reset>Reiniciar ${escapeHtml(phase.minutes)} min</button>
        </div>
      </div>
    </div>

    <div class="phase-body">
      <div class="script-strip">
        <div>
          <span class="pane-label">Frase de arranque</span>
          <p>${escapeHtml(phase.startPhrase || phase.phrase || "")}</p>
        </div>
        <div>
          <span class="pane-label">Cierre de la fase</span>
          <p>${escapeHtml(phase.closePhrase || phase.close || "")}</p>
        </div>
      </div>

      <div class="detail-grid">
        ${guidePanel("Minuto a minuto", phase.minutePlan, "is-priority")}
        ${guidePanel("Qué haces tú", phase.teacherActions)}
        ${guidePanel("Qué deben hacer ellos", phase.studentActions)}
        ${guidePanel("Preguntas que puedes lanzar", phase.questions || phase.ask, "is-question")}
        ${guidePanel("Qué espero escuchar", phase.expected, "is-good")}
        ${guidePanel("Si se atascan o se desvían", phase.rescue, "is-warning")}
        ${guidePanel("Qué escribir o proyectar", phase.board)}
        ${guidePanel("Qué recoger o vigilar", [...(phase.collect || []), ...(phase.watchFor || [])])}
        ${guidePanel("Frases preparadas", phase.preparedPhrases || phase.say)}
      </div>
    </div>
  `;
}

function renderActivity(phase) {
  const canExport = ["irat", "trat", "tapp"].includes(phase?.activity);
  activityPane.innerHTML = `
    <div class="activity-header">
      <h2>Panel docente de la fase</h2>
      ${
        canExport
          ? `<div class="button-row">
              <button type="button" class="quiet-button" data-export>Exportar respuestas</button>
            </div>`
          : ""
      }
    </div>
    <div class="activity-body">
      ${activityHtml(phase)}
    </div>
  `;
}

function activityHtml(phase) {
  if (!phase) return "";
  if (phase.activity === "irat" || phase.activity === "trat") return renderIratActivity(phase);
  if (phase.activity === "tapp") return renderTappActivity();
  if (phase.activity === "feedback") return renderFeedbackActivity();

  if (phase.activity === "assignDefense") {
    return `
      <div class="section-grid">
        <div class="info-block">
          <h3>Asignación sugerida</h3>
          ${listItems(caseData.defenseAssignments || [])}
        </div>
        <div class="info-block">
          <h3>Estructura de defensa</h3>
          ${listItems([
            "Dato clínico.",
            "Tejido o proteína implicada.",
            "Proceso celular o bioquímico.",
            "Consecuencia anatómica o funcional.",
            "Frase final clara."
          ])}
        </div>
      </div>
    `;
  }

  if (phase.activity === "prepareDefense") {
    return `
      <div class="section-grid">
        <div class="info-block">
          <h3>Checklist de defensa</h3>
          ${listItems([
            "Máximo 3 minutos.",
            "Todos los miembros deben tener una función.",
            "Debe aparecer un esquema causal.",
            "Debe conectar al menos dos disciplinas.",
            "Debe evitar jerga no explicada."
          ])}
        </div>
        <div class="info-block">
          <h3>Preguntas de presión suave</h3>
          ${listItems([
            "¿Cuál es el dato clínico exacto?",
            "¿Qué tejido está fallando?",
            "¿Dónde entra el RER o el Golgi en vuestra explicación?",
            "¿Qué parte explica hueso y qué parte explica signos extraóseos?"
          ])}
        </div>
      </div>
    `;
  }

  if (phase.activity === "close") {
    return `
      <div class="section-grid">
        <div class="info-block">
          <h3>Rúbrica rápida</h3>
          ${listItems([
            "Precisión conceptual.",
            "Integración entre disciplinas.",
            "Razonamiento causal.",
            "Claridad comunicativa.",
            "Participación equilibrada.",
            "Capacidad de responder preguntas."
          ])}
        </div>
        <div class="info-block">
          <h3>Mapa final</h3>
          ${renderCausalMap()}
        </div>
      </div>
    `;
  }

  return `
    <div class="section-grid">
      <div class="info-block">
        <h3>Foco de esta fase</h3>
        ${listItems(phase.focus || activityPrompts(phase.activity))}
      </div>
      <div class="info-block">
        <h3>Mapa causal</h3>
        ${renderCausalMap()}
      </div>
    </div>
  `;
}

function activityPrompts(activity) {
  const prompts = caseData.activityPrompts || {};
  return prompts[activity] || ["Seguir la guía de esta fase."];
}

function renderCausalMap() {
  const nodes = Array.isArray(caseData?.causalMap) ? caseData.causalMap : [];
  if (!nodes.length) return `<div class="empty-state">No hay mapa causal configurado.</div>`;
  return `<div class="causal-map">${nodes
    .map((node) => `<div class="causal-node">${escapeHtml(node)}</div>`)
    .join("")}</div>`;
}

function renderFeedbackActivity() {
  const blocks = Array.isArray(caseData.feedbackBlocks) ? caseData.feedbackBlocks : [];
  const questions = Array.isArray(caseData.iratQuestions) ? caseData.iratQuestions : [];
  const tips = caseData.feedbackQuestionTips || {};

  return `
    <div class="feedback-layout">
      <section>
        <h3>Escaleta de feedback</h3>
        <div class="timeline-list">
          ${
            blocks.length
              ? blocks
                  .map(
                    (block) => `
                      <article class="timeline-item">
                        <span class="timeline-time">${escapeHtml(block.time)}</span>
                        <div>
                          <h4>${escapeHtml(block.title)}</h4>
                          ${listItems(block.actions)}
                          <p class="script-line">${escapeHtml(block.script)}</p>
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="empty-state">No hay escaleta de feedback configurada.</div>`
          }
        </div>
      </section>

      <section>
        <h3>Corrección rápida por pregunta</h3>
        <div class="feedback-question-grid">
          ${
            questions.length
              ? questions
                  .map((question, index) => {
                    const tip = tips[question.id] || {};
                    return `
                      <article class="feedback-question">
                        <div class="feedback-question-head">
                          <span class="duration-pill">P${index + 1}</span>
                          <strong>${escapeHtml(tip.block || "Punto clave")}</strong>
                          <span class="answer-key">Clave ${escapeHtml(question.answer || "")}</span>
                        </div>
                        <p>${escapeHtml(question.text)}</p>
                        <p><strong>Di esto:</strong> ${escapeHtml(tip.correctInClass || question.explanation || "")}</p>
                        <p><strong>Si la han fallado:</strong> ${escapeHtml(tip.ifWrong || question.note || "")}</p>
                      </article>
                    `;
                  })
                  .join("")
              : `<div class="empty-state">No hay preguntas iRAT/tRAT configuradas.</div>`
          }
        </div>
      </section>

      <section>
        <h3>Mapa para cerrar la sesión</h3>
        ${renderCausalMap()}
      </section>
    </div>
  `;
}

function renderIratActivity(phase) {
  const key = phase.activity;
  const answers = state.answers[key] || {};
  const questions = Array.isArray(caseData.iratQuestions) ? caseData.iratQuestions : [];
  const quickKey = questions.map((question, index) => `${index + 1}${question.answer || "?"}`).join(" · ");
  const teamInput =
    key === "trat"
      ? `<label class="team-line">
          <span>Equipo</span>
          <input type="text" value="${escapeHtml(state.teamName)}" data-team-name placeholder="Nombre o número de equipo" />
        </label>`
      : "";

  if (!questions.length) {
    return `<div class="empty-state">No hay preguntas iRAT/tRAT configuradas.</div>`;
  }

  return `
    ${teamInput}
    <div class="teacher-note">
      <strong>Clave rápida:</strong> ${escapeHtml(quickKey)}
    </div>
    <div class="question-list">
      ${questions
        .map((question, index) => {
          const selected = answers[question.id] || "";
          return `
            <article class="question-item">
              <h3>${index + 1}. ${escapeHtml(question.text)}</h3>
              <div class="options-grid">
                ${Object.entries(question.options || {})
                  .map(([letter, option]) => {
                    const inputId = `${key}-${question.id}-${letter}`;
                    return `
                      <label class="option-line" for="${escapeHtml(inputId)}">
                        <input id="${escapeHtml(inputId)}" type="radio" name="${escapeHtml(
                          `${key}-${question.id}`
                        )}" value="${escapeHtml(letter)}" ${selected === letter ? "checked" : ""} data-mcq="${escapeHtml(
                          key
                        )}" data-question-id="${escapeHtml(question.id)}" />
                        <span><strong>${escapeHtml(letter)}.</strong> ${escapeHtml(option)}</span>
                      </label>
                    `;
                  })
                  .join("")}
              </div>
              <div class="answer-note">
                <strong>Respuesta:</strong> ${escapeHtml(question.answer)}. ${escapeHtml(question.explanation)}
              </div>
              <div class="teacher-note">
                <strong>Nota docente:</strong> ${escapeHtml(question.note)}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTappActivity() {
  const answers = state.answers.tapp || {};
  const questions = Array.isArray(caseData.tappQuestions) ? caseData.tappQuestions : [];
  if (!questions.length) return `<div class="empty-state">No hay preguntas tAPP configuradas.</div>`;

  return `
    <label class="team-line">
      <span>Equipo</span>
      <input type="text" value="${escapeHtml(state.teamName)}" data-team-name placeholder="Nombre o número de equipo" />
    </label>
    <div class="question-list">
      ${questions
        .map(
          (question, index) => `
            <article class="question-item">
              <h3>${index + 1}. ${escapeHtml(question.text)}</h3>
              <textarea class="textarea-answer" data-tapp-answer="${escapeHtml(
                question.id
              )}" placeholder="Respuesta del equipo">${answers[question.id] ? escapeHtml(answers[question.id]) : ""}</textarea>
              <div class="answer-note">
                <strong>Debe aparecer:</strong> ${(question.must || []).map(escapeHtml).join(" · ")}
              </div>
              <div class="teacher-note">
                <strong>Pregunta de rescate:</strong> ${escapeHtml(question.rescue)}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMaterials(phase) {
  const resources = Array.isArray(caseData.resources) ? caseData.resources : [];
  const phaseResourceIds = Array.isArray(phase?.materials) ? phase.materials : [];
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const phaseResources = phaseResourceIds.map((id) => resourcesById.get(id)).filter(Boolean);

  materialsPane.innerHTML = `
    <div class="materials-header">
      <h2>Materiales</h2>
      <span class="duration-pill">${phaseResources.length} para esta fase</span>
    </div>
    <div class="materials-body">
      <div class="section-grid">
        <div>
          <h3>Para esta fase</h3>
          ${renderResourceList(phaseResources)}
        </div>
        <div>
          <h3>Repositorio protegido</h3>
          ${renderResourceList(resources)}
        </div>
      </div>
    </div>
  `;
}

function renderResourceList(list) {
  if (!list.length) return `<div class="empty-state">No hay materiales configurados.</div>`;
  return `
    <div class="resource-list">
      ${list
        .map(
          (item) => `
            <a class="resource-row" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer">
              <span>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.description)}</span>
              </span>
              <span class="audience-pill">${escapeHtml(item.audience || "Docente")}</span>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

function setPhase(phaseId) {
  if (!phaseId) return;
  state.phaseId = phaseId;
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  state.timer.running = false;
}

function startTimer() {
  stopTimer();
  state.timer.running = true;
  timerHandle = setInterval(() => {
    state.timer.remaining = Math.max(0, state.timer.remaining - 1);
    const display = document.querySelector("#timerDisplay");
    if (display) display.textContent = formatTime(state.timer.remaining);
    if (state.timer.remaining === 0) {
      stopTimer();
      showToast("Tiempo de fase terminado");
    }
    saveState();
  }, 1000);
}

function pauseTimer() {
  stopTimer();
  saveState();
}

function resetTimer() {
  const phase = currentPhase();
  stopTimer();
  state.timer = {
    phaseId: phase?.id || "",
    remaining: Number(phase?.minutes || 0) * 60,
    running: false
  };
  saveState();
  render();
}

function exportAnswers() {
  const phase = currentPhase();
  const payload = {
    caseTitle: caseData?.title || "Caso docente",
    phaseId: phase?.id || "",
    phaseTitle: phase?.title || "",
    teamName: state.teamName || "",
    exportedAt: new Date().toISOString(),
    answers: state.answers || {}
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const safeTitle = (payload.phaseTitle || "respuestas").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeTitle}-medicina-integrada-caso1.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast("Respuestas exportadas");
}

async function loadProtectedCase() {
  const caseRef = doc(db, caseDocumentPath);
  const snapshot = await getDoc(caseRef);
  if (!snapshot.exists()) {
    caseData = null;
    render();
    return;
  }
  caseData = snapshot.data();
  render();
}

async function initFirebase() {
  if (!firebaseConfig) {
    loginError.textContent = "Falta firebase-config.js. Copia firebase-config.example.js y rellena los datos.";
    return;
  }

  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      stopTimer();
      setLocked(true);
      caseData = null;
      return;
    }

    setLocked(false);
    loginError.textContent = "";
    await loadProtectedCase().catch((error) => {
      caseData = null;
      render();
      showToast("No se pudo cargar Firestore");
      console.error(error);
    });
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth) return;

  loginError.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    passwordInput.value = "";
  } catch {
    loginError.textContent = "No se ha podido iniciar sesión.";
    passwordInput.select();
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, input, textarea");
  if (!target) return;

  if (target.matches("[data-logout]")) {
    await signOut(auth);
    return;
  }

  if (target.matches("[data-session-button]")) {
    state.session = target.dataset.sessionButton;
    saveState();
    render();
  }

  if (target.matches("[data-phase-id]")) setPhase(target.dataset.phaseId);
  if (target.matches("[data-go-phase]")) setPhase(target.dataset.goPhase);

  if (target.matches("[data-complete-phase]")) {
    const phaseId = target.dataset.completePhase;
    state.completed[phaseId] = !state.completed[phaseId];
    saveState();
    render();
  }

  if (target.matches("[data-export]")) exportAnswers();
  if (target.matches("[data-timer-start]")) startTimer();
  if (target.matches("[data-timer-pause]")) pauseTimer();
  if (target.matches("[data-timer-reset]")) resetTimer();
});

document.addEventListener("change", (event) => {
  const input = event.target.closest("[data-mcq]");
  if (!input) return;
  const bucket = input.dataset.mcq;
  state.answers = state.answers || {};
  state.answers[bucket] = state.answers[bucket] || {};
  state.answers[bucket][input.dataset.questionId] = input.value;
  saveState();
});

document.addEventListener("input", (event) => {
  const teamInput = event.target.closest("[data-team-name]");
  if (teamInput) {
    state.teamName = teamInput.value;
    saveState();
    return;
  }

  const answer = event.target.closest("[data-tapp-answer]");
  if (!answer) return;
  state.answers = state.answers || {};
  state.answers.tapp = state.answers.tapp || {};
  state.answers.tapp[answer.dataset.tappAnswer] = answer.value;
  saveState();
});

clearLoginFields();
initFirebase();
