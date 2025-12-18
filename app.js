// =====================
// Data loaded from JSON
// =====================

let QUESTIONS = [];
let GIFTS = [];
let totalQuestions = 0;
const PAGE_SIZE = 10;
let dataLoaded = false;

// =====================
// Custom Elements
// =====================

class SGQuestion extends HTMLElement {
  constructor() {
    super();
    this._question = null;
    this._sequence = null;
    this._value = null;
  }

  set question(q) {
    this._question = q;
    this._render();
  }

  set sequence(n) {
    this._sequence = n;
    this._render();
  }

  set value(v) {
    this._value = v;
    this._render();
  }

  get value() {
    return this._value;
  }

  _render() {
    if (!this._question || !this.isConnected) return;

    const q = this._question;
    const seq = this._sequence;
    const currentValue = this._value;

    // Text-only scale (no visible numbers)
    const scaleCaptions = {
      1: "Almost never true of me",
      2: "Occasionally true of me",
      3: "Sometimes true of me",
      4: "Often true of me",
      5: "Almost always true of me"
    };

    const optionsHtml = [1, 2, 3, 4, 5].map(v => {
      const checkedAttr = currentValue === v ? "checked" : "";
      // HTML validation: one required radio per group
      const requiredAttr = v === 1 ? "required" : "";
      return `
        <label class="q-option">
          <input type="radio" name="q-${q.id}" value="${v}" ${checkedAttr} ${requiredAttr} />
          <span class="caption">${scaleCaptions[v]}</span>
        </label>
      `;
    }).join("");

    this.innerHTML = `
      <div class="q-header-row">
        <div class="q-sequence">Q${seq}</div>
      </div>
      <div class="q-text">${q.text}</div>
      <div class="q-scale-hint">
        Choose the option that best describes how true this is for you.
      </div>
      <div class="q-options">
        ${optionsHtml}
      </div>
    `;

    this.querySelectorAll("input[type=radio]").forEach(input => {
      input.addEventListener("change", () => {
        const selected = Number(input.value);
        this._value = selected;
        this.dispatchEvent(new CustomEvent("answer-change", {
          bubbles: true,
          detail: {
            questionId: q.id,
            value: selected
          }
        }));
      });
    });
  }

  connectedCallback() {
    this._render();
  }
}

customElements.define("sg-question", SGQuestion);

class SGProgress extends HTMLElement {
  constructor() {
    super();
    this._value = 0;
    this._max = 100;
  }

  set value(v) {
    this._value = typeof v === "number" ? v : 0;
    this._render();
  }

  set max(m) {
    this._max = typeof m === "number" && m > 0 ? m : 100;
    this._render();
  }

  _render() {
    if (!this.isConnected) return;
    const percentage = this._max ? (this._value / this._max) * 100 : 0;
    this.innerHTML = `
      <div class="progress-outer" aria-hidden="true">
        <div class="progress-inner" style="width:${Math.min(100, percentage)}%;"></div>
      </div>
    `;
    this.setAttribute("role", "progressbar");
    this.setAttribute("aria-valuemin", "0");
    this.setAttribute("aria-valuemax", String(this._max));
    this.setAttribute("aria-valuenow", String(this._value));
  }

  connectedCallback() {
    this._render();
  }
}

customElements.define("sg-progress", SGProgress);

// =====================
// State
// =====================

let shuffledQuestions = [];
let currentPageIndex = 0;
const answers = {}; // { [questionId]: number }

// =====================
// Debug Mode
// =====================

const DEBUG_MODE = new URLSearchParams(window.location.search).has('debug');

// =====================
// DOM references
// =====================

const startPageEl = document.getElementById("start-page");
const quizPageEl = document.getElementById("quiz-page");
const resultsPageEl = document.getElementById("results-page");

const startBtn = document.getElementById("start-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const submitBtn = document.getElementById("submit-btn");
const restartBtn = document.getElementById("restart-btn");

const questionForm = document.getElementById("question-form");
const questionContainer = document.getElementById("question-container");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const pageIndicator = document.getElementById("page-indicator");
const quizErrorEl = document.getElementById("quiz-error");

const scoreSummaryEl = document.getElementById("score-summary");
const scoreTableBodyEl = document.getElementById("score-table-body");
const resultDescriptionsEl = document.getElementById("result-descriptions");

// Hide quiz & results until user starts
quizPageEl.classList.add("hidden");
resultsPageEl.classList.add("hidden");

// =====================
// Data loading
// =====================

async function loadData() {
  try {
    const [qRes, gRes] = await Promise.all([
      fetch("questions.json"),
      fetch("gifts.json")
    ]);

    if (!qRes.ok || !gRes.ok) {
      throw new Error("Failed to load JSON data");
    }

    QUESTIONS = await qRes.json();
    GIFTS = await gRes.json();
    totalQuestions = QUESTIONS.length;

    dataLoaded = true;
    // Update initial progress display with actual total
    progressText.textContent = `0 / ${totalQuestions} answered`;
  } catch (err) {
    console.error(err);
    quizErrorEl.textContent = "Error loading assessment data. Please check that JSON files are present.";
  }
}

loadData();

// Show debug mode indicator
if (DEBUG_MODE) {
  const debugBanner = document.createElement("div");
  debugBanner.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(255, 107, 107, 0.7);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 14px;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  debugBanner.textContent = "🐛 DEBUG MODE";
  document.body.appendChild(debugBanner);
}

// =====================
// Helpers
// =====================

function shuffleArray(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getQuestionsForPage(index) {
  const start = index * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return shuffledQuestions.slice(start, end);
}

function updateProgress() {
  const answeredCount = shuffledQuestions.reduce(
    (acc, q) => acc + (answers[q.id] ? 1 : 0),
    0
  );
  progressBar.max = totalQuestions || 1;
  progressBar.value = answeredCount;
  progressText.textContent = `${answeredCount} / ${totalQuestions} answered`;
}

function renderPage() {
  quizErrorEl.textContent = "";
  const totalPages = Math.ceil(totalQuestions / PAGE_SIZE) || 1;
  const pageQuestions = getQuestionsForPage(currentPageIndex);
  questionContainer.innerHTML = "";

  pageQuestions.forEach((q, indexOnPage) => {
    const seq = currentPageIndex * PAGE_SIZE + indexOnPage + 1;
    const qEl = document.createElement("sg-question");
    qEl.question = q;
    qEl.sequence = seq;
    qEl.value = answers[q.id] ?? null;
    questionContainer.appendChild(qEl);
  });

  pageIndicator.textContent = `Page ${currentPageIndex + 1} of ${totalPages}`;
  prevBtn.disabled = currentPageIndex === 0;

  const onLastPage = currentPageIndex === totalPages - 1;
  const allAnswered = shuffledQuestions.every(q => answers[q.id]);

  // Show Next button if not on last page
  nextBtn.classList.toggle("hidden", onLastPage);

  // Show Submit button if on last page OR if all answers are completed
  submitBtn.classList.toggle("hidden", !onLastPage && !allAnswered);

  updateProgress();
}

// Validate *current page* using HTML required validation
function validateCurrentPage() {
  const isValid = questionForm.checkValidity();
  if (!isValid) {
    quizErrorEl.textContent = "Please answer every question on this page before continuing.";
    questionForm.reportValidity(); // highlights first missing
  } else {
    quizErrorEl.textContent = "";
  }
  return isValid;
}

function computeGiftScores() {
  const results = GIFTS.map(g => {
    const total = g.items.reduce((sum, id) => sum + (answers[id] || 0), 0);
    return {
      key: g.key,
      name: g.name,
      total,
      description: g.description
    };
  });

  results.sort((a, b) => b.total - a.total);
  return results;
}

function sendResultsToServer(payload) {
  // ==============================
  // ⬇ SERVER HOOK (currently a stub)
  // Replace this with an actual POST / fetch call if/when you want to send
  // the results to your backend.
  // Example:
  // fetch("/api/spiritual-gifts-results", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload)
  // });
  // ==============================
  console.log("sendResultsToServer hook called with payload:", payload);
}

function showResults() {
  const giftScores = computeGiftScores();

  // Top 3 summary
  const topThree = giftScores.slice(0, 3);
  if (topThree.length) {
    const summaryList = topThree
      .map(g => `<li><strong>${g.name}</strong> – score ${g.total}</li>`)
      .join("");
    scoreSummaryEl.innerHTML = `
      <p>Your strongest gift areas appear to be:</p>
      <ul>${summaryList}</ul>
    `;
  } else {
    scoreSummaryEl.textContent = "No responses recorded.";
  }

  // Collapsible gift items with top 3 expanded using native HTML5 details/summary
  resultDescriptionsEl.innerHTML = giftScores
    .map((g, index) => {
      const isTopThree = index < 3;
      const openAttr = isTopThree ? 'open' : '';
      return `
        <details class="gift-item" ${openAttr} data-gift-id="${g.key}">
          <summary class="gift-header">
            <div class="gift-header-content">
              <h4 class="gift-name">${g.name}</h4>
              <span class="gift-score">${g.total}</span>
            </div>
          </summary>
          <div class="gift-description">
            <p>${g.description || ""}</p>
          </div>
        </details>
      `;
    })
    .join("");

  // Hide the old table
  scoreTableBodyEl.closest('.results-table-wrapper').style.display = 'none';

  quizPageEl.classList.add("hidden");
  resultsPageEl.classList.remove("hidden");

  const payload = {
    completedAt: new Date().toISOString(),
    answers: { ...answers },
    giftScores
  };
  sendResultsToServer(payload);
}

// Belt-and-braces: ensure *all* questions are answered
function ensureAllAnsweredBeforeSubmit() {
  const unanswered = shuffledQuestions.filter(q => !answers[q.id]);
  if (unanswered.length === 0) {
    return true;
  }
  const firstUnanswered = unanswered[0];
  const index = shuffledQuestions.findIndex(q => q.id === firstUnanswered.id);
  currentPageIndex = Math.floor(index / PAGE_SIZE);
  renderPage();
  quizErrorEl.textContent = `Please answer all questions before viewing your results (${unanswered.length} remaining).`;
  return false;
}

function resetStateAndRestart() {
  Object.keys(answers).forEach(k => delete answers[k]);
  shuffledQuestions = [];
  currentPageIndex = 0;
  quizErrorEl.textContent = "";
  progressBar.value = 0;
  progressText.textContent = `0 / ${totalQuestions} answered`;

  resultsPageEl.classList.add("hidden");
  quizPageEl.classList.add("hidden");
  startPageEl.classList.remove("hidden");
}

// =====================
// Event handlers
// =====================

startBtn.addEventListener("click", () => {
  if (!dataLoaded) {
    alert("The assessment data is still loading. Please try again in a moment.");
    return;
  }

  shuffledQuestions = shuffleArray(QUESTIONS);
  Object.keys(answers).forEach(k => delete answers[k]);
  currentPageIndex = 0;

  // Debug mode: auto-fill all answers
  if (DEBUG_MODE) {
    shuffledQuestions.forEach(q => {
      answers[q.id] = Math.floor(Math.random() * 5) + 1; // Random 1-5
    });
    console.log("🐛 Debug mode: Auto-filled all answers");
  }

  startPageEl.classList.add("hidden");
  resultsPageEl.classList.add("hidden");
  quizPageEl.classList.remove("hidden");

  renderPage();
});

// Listen for answer-change from sg-question elements
questionContainer.addEventListener("answer-change", (event) => {
  const { questionId, value } = event.detail;
  answers[questionId] = value;
  updateProgress();

  // Check if all answers are completed to show submit button
  const allAnswered = shuffledQuestions.every(q => answers[q.id]);
  const totalPages = Math.ceil(totalQuestions / PAGE_SIZE) || 1;
  const onLastPage = currentPageIndex === totalPages - 1;

  // Update submit button visibility when all answers are completed
  submitBtn.classList.toggle("hidden", !onLastPage && !allAnswered);
});

prevBtn.addEventListener("click", () => {
  if (currentPageIndex > 0) {
    currentPageIndex -= 1;
    renderPage();

    const quizPage = document.getElementById("quiz-page");
    quizPage.scrollTo({ top: 0, behavior: "smooth" });
  }
});

nextBtn.addEventListener("click", () => {
  if (!validateCurrentPage()) return;

  const totalPages = Math.ceil(totalQuestions / PAGE_SIZE);
  if (currentPageIndex < totalPages - 1) {
    currentPageIndex += 1;
    renderPage();

    // reset scroll to top of the quiz container
    const quizPage = document.getElementById("quiz-page");
    quizPage.scrollTo({ top: 0, behavior: "smooth" });
  }
});

submitBtn.addEventListener("click", () => {
  if (!validateCurrentPage()) return;
  if (!ensureAllAnsweredBeforeSubmit()) return;

  showResults();

  window.scrollTo({ top: 0, behavior: "smooth" });
});

restartBtn.addEventListener("click", () => {
  resetStateAndRestart();
});