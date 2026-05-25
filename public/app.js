const STORAGE_KEY = "interviewpulse-history-v1";
const CODE_REVIEW_KEY = "interviewpulse-code-reviews-v1";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const elements = {
  role: document.querySelector("#role-input"),
  type: document.querySelector("#interview-type"),
  question: document.querySelector("#question-input"),
  response: document.querySelector("#response-input"),
  questionInterim: document.querySelector("#question-interim"),
  responseInterim: document.querySelector("#response-interim"),
  listenButton: document.querySelector("#listen-question-button"),
  listenLabel: document.querySelector("#listen-label"),
  generateButton: document.querySelector("#generate-button"),
  answerOutput: document.querySelector("#answer-output"),
  speakButton: document.querySelector("#speak-answer-button"),
  stopSpeakingButton: document.querySelector("#stop-speaking-button"),
  recordButton: document.querySelector("#record-response-button"),
  recordLabel: document.querySelector("#record-label"),
  analyzeButton: document.querySelector("#analyze-button"),
  status: document.querySelector("#session-status"),
  newSession: document.querySelector("#new-session-button"),
  questionCount: document.querySelector("#question-count"),
  interviewScore: document.querySelector("#interview-score"),
  averageTechnical: document.querySelector("#average-technical"),
  sessionTime: document.querySelector("#session-time"),
  emptyInsights: document.querySelector("#empty-insights"),
  insights: document.querySelector("#insights"),
  confidence: document.querySelector("#confidence-score"),
  grammar: document.querySelector("#grammar-score"),
  communication: document.querySelector("#communication-score"),
  technical: document.querySelector("#technical-score"),
  confidenceBar: document.querySelector("#confidence-bar"),
  grammarBar: document.querySelector("#grammar-bar"),
  communicationBar: document.querySelector("#communication-bar"),
  technicalBar: document.querySelector("#technical-bar"),
  words: document.querySelector("#words-count"),
  pace: document.querySelector("#pace-score"),
  fillers: document.querySelector("#filler-count"),
  strengthList: document.querySelector("#strength-list"),
  improvementList: document.querySelector("#improvement-list"),
  history: document.querySelector("#history-list"),
  weakTopics: document.querySelector("#weak-topic-list"),
  clearHistory: document.querySelector("#clear-history-button"),
  resumeFile: document.querySelector("#resume-file"),
  resumeFileLabel: document.querySelector("#resume-file-label"),
  resumeQuestionsButton: document.querySelector("#resume-questions-button"),
  resumeOutput: document.querySelector("#resume-questions-output"),
  codeLanguage: document.querySelector("#code-language"),
  codeProblem: document.querySelector("#code-problem"),
  codeInput: document.querySelector("#code-input"),
  reviewCodeButton: document.querySelector("#review-code-button"),
  codeReviewOutput: document.querySelector("#code-review-output"),
  codeScore: document.querySelector("#code-score"),
  codeSummary: document.querySelector("#code-summary"),
  timeComplexity: document.querySelector("#time-complexity"),
  spaceComplexity: document.querySelector("#space-complexity"),
  codeErrors: document.querySelector("#code-errors"),
  codeOptimizations: document.querySelector("#code-optimizations"),
  toast: document.querySelector("#toast")
};

const state = {
  questionRecognition: null,
  responseRecognition: null,
  answer: "",
  responseStartedAt: null,
  sessionStartedAt: Date.now(),
  attempts: [],
  toastTimer: null
};

function setStatus(label, style = "") {
  elements.status.textContent = label;
  elements.status.className = `status-badge ${style}`.trim();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2800);
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(attempt) {
  const entries = [attempt, ...readHistory()].slice(0, 15);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  renderHistory();
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderSessionSummary() {
  const attempts = readHistory();
  elements.questionCount.textContent = String(attempts.length);
  if (!attempts.length) {
    elements.interviewScore.textContent = "--";
    elements.averageTechnical.textContent = "--";
    return;
  }
  const averages = attempts.reduce(
    (result, attempt) => {
      result.confidence += attempt.analysis.scores.confidence;
      result.grammar += attempt.analysis.scores.grammar;
      result.communication += attempt.analysis.scores.communication;
      result.technical += attempt.analysis.scores.technicalCorrectness ?? attempt.analysis.scores.communication;
      return result;
    },
    { confidence: 0, grammar: 0, communication: 0, technical: 0 }
  );
  const total = attempts.length;
  const score = (averages.confidence + averages.grammar + averages.communication + averages.technical) / (total * 4);
  elements.interviewScore.textContent = `${Math.round(score)}%`;
  elements.averageTechnical.textContent = `${Math.round(averages.technical / total)}%`;
}

function makeList(container, entries) {
  container.replaceChildren();
  entries.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    container.appendChild(item);
  });
}

function renderInsights(analysis) {
  elements.emptyInsights.classList.add("hidden");
  elements.insights.classList.remove("hidden");
  elements.confidence.textContent = analysis.scores.confidence;
  elements.grammar.textContent = analysis.scores.grammar;
  elements.communication.textContent = analysis.scores.communication;
  elements.technical.textContent = analysis.scores.technicalCorrectness ?? analysis.scores.communication;
  elements.confidenceBar.style.width = `${analysis.scores.confidence}%`;
  elements.grammarBar.style.width = `${analysis.scores.grammar}%`;
  elements.communicationBar.style.width = `${analysis.scores.communication}%`;
  elements.technicalBar.style.width = `${analysis.scores.technicalCorrectness ?? analysis.scores.communication}%`;
  elements.words.textContent = analysis.metrics.words;
  elements.pace.textContent = analysis.metrics.wpm || "--";
  elements.fillers.textContent = analysis.metrics.fillers;
  makeList(elements.strengthList, analysis.strengths);
  makeList(elements.improvementList, analysis.improvements);
}

function renderHistory() {
  const entries = readHistory();
  elements.history.replaceChildren();
  if (!entries.length) {
    const message = document.createElement("p");
    message.className = "empty-history";
    message.textContent = "No sessions saved yet.";
    elements.history.appendChild(message);
  } else {
    entries.slice(0, 5).forEach((entry) => {
      const row = document.createElement("article");
      row.className = "history-entry";
      row.tabIndex = 0;
      const question = document.createElement("strong");
      question.textContent = entry.question;
      const meta = document.createElement("div");
      meta.className = "history-meta";
      const score = document.createElement("span");
      score.textContent = `${entry.analysis.scores.communication}% communication`;
      const date = document.createElement("span");
      date.textContent = new Date(entry.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      meta.append(score, date);
      row.append(question, meta);
      const restore = () => restoreAttempt(entry);
      row.addEventListener("click", restore);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter") restore();
      });
      elements.history.appendChild(row);
    });
  }
  renderWeakTopics(entries);
  renderSessionSummary();
}

function renderWeakTopics(entries) {
  const topicCounts = new Map();
  entries.forEach((entry) => {
    (entry.analysis.weakTopics || []).forEach((topic) => {
      const label = String(topic).trim();
      if (label) topicCounts.set(label, (topicCounts.get(label) || 0) + 1);
    });
  });
  elements.weakTopics.replaceChildren();
  const topics = [...topicCounts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 5);
  if (!topics.length) {
    const item = document.createElement("span");
    item.className = "muted-chip";
    item.textContent = "Complete an analysis to identify topics.";
    elements.weakTopics.appendChild(item);
    return;
  }
  topics.forEach(([topic]) => {
    const item = document.createElement("span");
    item.className = "topic-chip";
    item.textContent = topic;
    elements.weakTopics.appendChild(item);
  });
}

function restoreAttempt(entry) {
  elements.role.value = entry.role || "";
  elements.type.value = entry.type || "Behavioral";
  elements.question.value = entry.question;
  elements.response.value = entry.response;
  state.answer = entry.answer;
  elements.answerOutput.textContent = entry.answer;
  elements.answerOutput.classList.add("generated");
  elements.speakButton.disabled = false;
  renderInsights(entry.analysis);
  showToast("Previous practice response loaded.");
}

function speechUnsupported() {
  showToast("Speech recognition is unavailable here. Type your text or use Chrome/Edge.");
}

function beginRecognition(kind) {
  if (!SpeechRecognition) {
    speechUnsupported();
    return;
  }
  const isQuestion = kind === "question";
  const activeRecognition = isQuestion ? state.questionRecognition : state.responseRecognition;
  if (activeRecognition) {
    activeRecognition.stop();
    return;
  }
  const input = isQuestion ? elements.question : elements.response;
  const interim = isQuestion ? elements.questionInterim : elements.responseInterim;
  const button = isQuestion ? elements.listenButton : elements.recordButton;
  const label = isQuestion ? elements.listenLabel : elements.recordLabel;
  const recognition = new SpeechRecognition();
  let finalTranscript = input.value.trim();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  if (!isQuestion) state.responseStartedAt = Date.now();

  recognition.onstart = () => {
    button.classList.add("active");
    label.textContent = isQuestion ? "Stop listening" : "Stop recording";
    setStatus(isQuestion ? "Listening to question" : "Recording response", "listening");
  };
  recognition.onresult = (event) => {
    let temporaryText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = event.results[i][0].transcript.trim();
      if (event.results[i].isFinal) {
        finalTranscript = `${finalTranscript} ${text}`.trim();
      } else {
        temporaryText = text;
      }
    }
    input.value = finalTranscript;
    interim.textContent = temporaryText ? `Hearing: ${temporaryText}` : "";
  };
  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      showToast(`Microphone error: ${event.error}.`);
    }
  };
  recognition.onend = () => {
    button.classList.remove("active");
    label.textContent = isQuestion ? "Listen for question" : "Record my response";
    interim.textContent = "";
    if (isQuestion) state.questionRecognition = null;
    else state.responseRecognition = null;
    setStatus("Ready");
  };
  if (isQuestion) state.questionRecognition = recognition;
  else state.responseRecognition = recognition;
  recognition.start();
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error || "Request failed");
  }
  return response.json();
}

async function generateAnswer() {
  const question = elements.question.value.trim();
  if (!question) {
    showToast("Capture or type a question first.");
    elements.question.focus();
    return;
  }
  elements.generateButton.disabled = true;
  elements.answerOutput.classList.remove("generated");
  elements.answerOutput.textContent = "Building a concise answer framework...";
  setStatus("Preparing guide", "thinking");
  try {
    const result = await requestJson("/api/answer", {
      question,
      role: elements.role.value.trim(),
      interviewType: elements.type.value
    });
    state.answer = result.answer;
    elements.answerOutput.textContent = result.answer;
    elements.answerOutput.classList.add("generated");
    elements.speakButton.disabled = false;
    showToast(result.aiPowered ? "AI answer guide ready." : "Practice answer guide ready in offline mode.");
  } catch (error) {
    elements.answerOutput.textContent = "Unable to prepare a guide right now. Please try again.";
    showToast(error.message);
  } finally {
    elements.generateButton.disabled = false;
    setStatus("Ready");
  }
}

function speakAnswer() {
  if (!state.answer || !("speechSynthesis" in window)) {
    showToast("Speech playback is unavailable in this browser.");
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(state.answer.replace(/\n/g, " "));
  utterance.rate = 0.96;
  utterance.pitch = 1;
  utterance.onstart = () => {
    elements.stopSpeakingButton.disabled = false;
    setStatus("Speaking guide", "thinking");
  };
  utterance.onend = () => {
    elements.stopSpeakingButton.disabled = true;
    setStatus("Ready");
  };
  speechSynthesis.speak(utterance);
}

async function analyzeResponse() {
  const responseText = elements.response.value.trim();
  const question = elements.question.value.trim();
  if (!question || !responseText) {
    showToast("Add both the question and your practice response.");
    return;
  }
  if (state.responseRecognition) state.responseRecognition.stop();
  const elapsedSeconds = state.responseStartedAt
    ? Math.max(8, Math.round((Date.now() - state.responseStartedAt) / 1000))
    : null;
  elements.analyzeButton.disabled = true;
  setStatus("Analyzing delivery", "thinking");
  try {
    const analysis = await requestJson("/api/analyze", {
      question,
      answerGuide: state.answer,
      response: responseText,
      role: elements.role.value.trim(),
      interviewType: elements.type.value,
      elapsedSeconds
    });
    renderInsights(analysis);
    const attempt = {
      date: new Date().toISOString(),
      role: elements.role.value.trim(),
      type: elements.type.value,
      question,
      answer: state.answer,
      response: responseText,
      analysis
    };
    state.attempts.push(attempt);
    saveHistory(attempt);
    renderSessionSummary();
    showToast(analysis.aiPowered ? "AI coaching feedback ready." : "Coaching feedback ready in offline mode.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.analyzeButton.disabled = false;
    setStatus("Ready");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""));
    reader.addEventListener("error", () => reject(new Error("Unable to read the resume PDF.")));
    reader.readAsDataURL(file);
  });
}

async function generateResumeQuestions() {
  const file = elements.resumeFile.files[0];
  if (!file) {
    showToast("Choose your resume PDF first.");
    return;
  }
  if (file.size > 5_000_000) {
    showToast("Resume PDF must be smaller than 5 MB.");
    return;
  }
  elements.resumeQuestionsButton.disabled = true;
  elements.resumeQuestionsButton.textContent = "Reading resume...";
  try {
    const result = await requestJson("/api/resume-questions", {
      pdfBase64: await fileToBase64(file),
      role: elements.role.value.trim() || "Software Engineer"
    });
    elements.resumeOutput.replaceChildren();
    result.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.className = "question-choice";
      const number = document.createElement("strong");
      number.textContent = `${index + 1}.`;
      const label = document.createElement("span");
      label.textContent = question;
      button.append(number, label);
      button.addEventListener("click", () => {
        elements.question.value = question;
        elements.type.value = /design|architecture|scale/i.test(question) ? "System Design" : "Technical";
        elements.question.scrollIntoView({ behavior: "smooth", block: "center" });
        showToast("Resume question loaded into live practice.");
      });
      elements.resumeOutput.appendChild(button);
    });
    elements.resumeOutput.classList.remove("hidden");
    showToast(result.aiPowered ? "Personalized resume questions ready." : "Resume questions ready in offline mode.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.resumeQuestionsButton.disabled = false;
    elements.resumeQuestionsButton.textContent = "Generate resume questions";
  }
}

function renderCodeReview(review) {
  elements.codeReviewOutput.classList.remove("hidden");
  elements.codeScore.classList.remove("hidden");
  elements.codeScore.textContent = `${review.score}%`;
  elements.codeSummary.textContent = review.summary;
  elements.timeComplexity.textContent = review.timeComplexity;
  elements.spaceComplexity.textContent = review.spaceComplexity;
  makeList(elements.codeErrors, review.errors.length ? review.errors : ["No clear correctness issue identified. Verify edge cases."]);
  makeList(elements.codeOptimizations, review.optimizations.length ? review.optimizations : ["Explain your approach and Big-O during the interview."]);
}

async function reviewCode() {
  if (!elements.codeInput.value.trim()) {
    showToast("Paste your solution before requesting code feedback.");
    return;
  }
  elements.reviewCodeButton.disabled = true;
  elements.reviewCodeButton.textContent = "Reviewing...";
  try {
    const review = await requestJson("/api/code-review", {
      language: elements.codeLanguage.value,
      problem: elements.codeProblem.value.trim(),
      code: elements.codeInput.value
    });
    renderCodeReview(review);
    localStorage.setItem(CODE_REVIEW_KEY, JSON.stringify({ ...review, date: new Date().toISOString() }));
    showToast(review.aiPowered ? "Ollama code review ready." : "Basic code review guidance ready.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.reviewCodeButton.disabled = false;
    elements.reviewCodeButton.textContent = "Review code";
  }
}

function resetSession() {
  if (state.questionRecognition) state.questionRecognition.stop();
  if (state.responseRecognition) state.responseRecognition.stop();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  elements.question.value = "";
  elements.response.value = "";
  elements.answerOutput.textContent = "Your suggested answer will appear here after a question is captured.";
  elements.answerOutput.classList.remove("generated");
  elements.speakButton.disabled = true;
  elements.stopSpeakingButton.disabled = true;
  elements.emptyInsights.classList.remove("hidden");
  elements.insights.classList.add("hidden");
  state.answer = "";
  state.attempts = [];
  state.sessionStartedAt = Date.now();
  state.responseStartedAt = null;
  renderSessionSummary();
  showToast("New practice session started.");
}

elements.listenButton.addEventListener("click", () => beginRecognition("question"));
elements.recordButton.addEventListener("click", () => beginRecognition("response"));
elements.generateButton.addEventListener("click", generateAnswer);
elements.speakButton.addEventListener("click", speakAnswer);
elements.stopSpeakingButton.addEventListener("click", () => {
  speechSynthesis.cancel();
  elements.stopSpeakingButton.disabled = true;
  setStatus("Ready");
});
elements.analyzeButton.addEventListener("click", analyzeResponse);
elements.resumeFile.addEventListener("change", () => {
  const file = elements.resumeFile.files[0];
  elements.resumeFileLabel.textContent = file ? file.name : "Choose resume PDF";
});
elements.resumeQuestionsButton.addEventListener("click", generateResumeQuestions);
elements.reviewCodeButton.addEventListener("click", reviewCode);
elements.newSession.addEventListener("click", resetSession);
elements.clearHistory.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
  showToast("Practice history cleared.");
});

renderHistory();
try {
  const savedCodeReview = JSON.parse(localStorage.getItem(CODE_REVIEW_KEY));
  if (savedCodeReview) renderCodeReview(savedCodeReview);
} catch {
  localStorage.removeItem(CODE_REVIEW_KEY);
}
setInterval(() => {
  elements.sessionTime.textContent = formatDuration(Date.now() - state.sessionStartedAt);
}, 1000);
