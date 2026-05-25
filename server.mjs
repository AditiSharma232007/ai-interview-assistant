import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("./public/", import.meta.url));
const standardFontDirectory = `${fileURLToPath(new URL("./node_modules/pdfjs-dist/standard_fonts/", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "")}/`;
const port = Number(process.env.PORT) || 3000;
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:3b";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8_000_000) throw new Error("Request is too large.");
  }
  return JSON.parse(body || "{}");
}

function sanitizeText(value, maxLength = 6000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function aiResponse(instructions, input, { jsonOutput = false, numPredict = 280 } = {}) {
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input }
      ],
      ...(jsonOutput ? { format: "json" } : {}),
      options: {
        temperature: jsonOutput ? 0.2 : 0.5,
        num_predict: numPredict
      }
    })
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${message.slice(0, 120)}`);
  }
  const data = await response.json();
  return typeof data.message?.content === "string" ? data.message.content.trim() : "";
}

function fallbackGuide({ question, role, interviewType }) {
  const rolePhrase = role ? ` for the ${role} role` : "";
  if (/tell me about yourself|walk me through your (resume|background)/i.test(question)) {
    return `Start with your present focus and the strength most relevant${rolePhrase}. Summarize one past achievement with a measurable result, then connect it to why this opportunity is your logical next step.\n\nTry this structure: "I currently focus on [area], where I recently [achievement and result]. Earlier, I developed [relevant skill]. I am interested in this role because I can apply those strengths to [business need]."`;
  }
  if (/weakness|failure|mistake|conflict|difficult|challenge/i.test(question)) {
    return `Use a candid STAR response${rolePhrase}: name a real situation, state your responsibility, explain the action you personally took, and end with the measurable result and what changed in your approach afterward.\n\nKeep the lesson concrete. For a ${interviewType.toLowerCase()} interview, emphasize judgment, accountability, and how you would apply the learning again.`;
  }
  if (/design|architecture|scale|system/i.test(question)) {
    return `Clarify requirements first, then present assumptions, core components, data flow, scaling choices, failure handling, and trade-offs. Tie each decision to reliability, latency, cost, or maintainability${rolePhrase}.\n\nClose by identifying what you would measure and which constraint could change your design.`;
  }
  return `Frame a direct answer in three parts${rolePhrase}: your main point, a specific example that proves it, and the outcome or lesson. Address "${question}" explicitly before adding context.\n\nFor a ${interviewType.toLowerCase()} interview, aim for a focused 60-90 second response with one quantified result and a confident closing connection to the role.`;
}

async function buildAnswer(payload) {
  const question = sanitizeText(payload.question, 1000);
  const role = sanitizeText(payload.role, 120);
  const interviewType = sanitizeText(payload.interviewType, 80) || "Behavioral";
  if (!question) throw new Error("A question is required.");
  const fallback = fallbackGuide({ question, role, interviewType });
  try {
    const answer = await aiResponse(
      "You are an interview practice coach. Produce a realistic first-person answer guide the candidate can study and adapt, not a claim of experience they did not provide. Keep it under 150 words. For behavioral questions, use STAR placeholders where details are missing. Avoid markdown headings and mention what the candidate should personalize.",
      `Target role: ${role || "not specified"}\nInterview type: ${interviewType}\nPractice question: ${question}`
    );
    return { answer: answer || fallback, aiPowered: Boolean(answer) };
  } catch (error) {
    console.error(error.message);
    return { answer: fallback, aiPowered: false };
  }
}

function clamp(value, minimum = 1, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function topicFromQuestion(question) {
  const topicMap = [
    ["data structures", /array|linked list|stack|queue|tree|graph|hash/i],
    ["algorithms", /algorithm|binary search|sorting|complexity|dynamic programming/i],
    ["APIs", /api|rest|http|endpoint|microservice/i],
    ["databases", /sql|database|index|transaction|nosql/i],
    ["system design", /design|scale|architecture|distributed|cache|queue/i],
    ["testing", /test|debug|quality|unit test/i]
  ];
  return topicMap.find(([, pattern]) => pattern.test(question))?.[0] || "answer depth";
}

function localAnalysis({ question, response, elapsedSeconds, interviewType }) {
  const words = response.match(/\b[\w']+\b/g) || [];
  const sentences = response.split(/[.!?]+/).filter((part) => part.trim()).length || 1;
  const fillerMatches = response.match(/\b(um|uh|like|basically|actually|literally|you know|sort of|kind of)\b/gi) || [];
  const uncertainty = response.match(/\b(i think|maybe|probably|i guess|not sure)\b/gi) || [];
  const firstPersonActions = response.match(/\b(i led|i created|i built|i analyzed|i delivered|i resolved|i decided|i implemented|i improved)\b/gi) || [];
  const metricsMentioned = /\b\d+(?:[.,]\d+)?%?\b/.test(response);
  const duration = Number(elapsedSeconds) > 0 ? Number(elapsedSeconds) : Math.max(20, (words.length / 130) * 60);
  const wpm = words.length ? Math.round((words.length / duration) * 60) : 0;
  const hasOpeningCapital = /^[A-Z]/.test(response);
  const hasClosingPunctuation = /[.!?]$/.test(response);
  const fillerPenalty = fillerMatches.length * 5;
  const pacePenalty = wpm < 85 ? 10 : wpm > 180 ? 14 : 0;

  const confidence = clamp(67 + Math.min(firstPersonActions.length * 5, 13) + (metricsMentioned ? 7 : 0) - fillerPenalty - uncertainty.length * 5 - pacePenalty);
  const grammar = clamp(73 + (hasOpeningCapital ? 7 : -7) + (hasClosingPunctuation ? 6 : -6) - Math.max(0, words.length / sentences - 32));
  const communication = clamp(62 + (words.length >= 45 ? 8 : -7) + (metricsMentioned ? 10 : 0) + (sentences >= 3 ? 7 : -5) - fillerPenalty / 2 - pacePenalty);
  const isTechnical = /technical|system design/i.test(interviewType || "") || /algorithm|complexity|api|database|design|code|data structure/i.test(question);
  const technicalCorrectness = isTechnical ? clamp(58 + (words.length >= 35 ? 9 : 0) + (/\b(because|trade-?off|complexity|latency|memory|scal)/i.test(response) ? 11 : 0)) : 75;
  const strengths = [];
  const improvements = [];

  if (firstPersonActions.length) strengths.push("You described personal action, which makes ownership clear.");
  if (metricsMentioned) strengths.push("A measurable detail strengthened credibility and impact.");
  if (wpm >= 95 && wpm <= 165) strengths.push("Your speaking pace supports clear, confident delivery.");
  if (!strengths.length) strengths.push("You completed a response that can now be refined through repetition.");

  if (!metricsMentioned) improvements.push("Add a result, scale, or metric to make the example memorable.");
  if (fillerMatches.length) improvements.push(`Reduce filler words (${fillerMatches.length} detected) by pausing briefly between ideas.`);
  if (words.length < 45) improvements.push("Expand the example using situation, action, and result so the answer feels complete.");
  if (wpm > 180) improvements.push("Slow your pace to make key decisions and outcomes easier to follow.");
  if (wpm < 85) improvements.push("Aim for a slightly more energetic pace while keeping sentences concise.");
  if (!hasClosingPunctuation || !hasOpeningCapital) improvements.push("Review sentence boundaries and capitalization in the transcript.");
  if (!improvements.length) improvements.push("Tighten your opening sentence so your core point lands even faster.");

  return {
    scores: { confidence, grammar, communication, technicalCorrectness },
    metrics: { words: words.length, wpm, fillers: fillerMatches.length },
    strengths: strengths.slice(0, 2),
    improvements: improvements.slice(0, 3),
    weakTopics: [topicFromQuestion(question)],
    aiPowered: false
  };
}

function parseAiCoaching(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : null;
    if (!data || !Array.isArray(data.strengths) || !Array.isArray(data.improvements)) return null;
    return {
      strengths: data.strengths.map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 2),
      improvements: data.improvements.map((item) => sanitizeText(item, 180)).filter(Boolean).slice(0, 3),
      weakTopics: Array.isArray(data.weakTopics)
        ? data.weakTopics.map((item) => sanitizeText(item, 80)).filter(Boolean).slice(0, 3)
        : [],
      technicalCorrectness: Number.isFinite(Number(data.technicalCorrectness))
        ? clamp(Number(data.technicalCorrectness))
        : null
    };
  } catch {
    return null;
  }
}

async function analyzeAnswer(payload) {
  const response = sanitizeText(payload.response);
  const question = sanitizeText(payload.question, 1000);
  const interviewType = sanitizeText(payload.interviewType, 80);
  if (!question || !response) throw new Error("A question and response are required.");
  const analysis = localAnalysis({ question, response, elapsedSeconds: payload.elapsedSeconds, interviewType });
  try {
    const coaching = parseAiCoaching(
      await aiResponse(
        "You are a supportive interview coach. Evaluate relevance, clarity, evidence, grammar, and, where applicable, technical correctness. Respond only as JSON: {\"strengths\":[\"...\",\"...\"],\"improvements\":[\"...\",\"...\",\"...\"],\"technicalCorrectness\":0,\"weakTopics\":[\"topic\"]}. Technical correctness must be a 0-100 score. Be specific and concise; do not change confidence, grammar, or communication scores.",
        `Interview type: ${interviewType || "not specified"}\nQuestion: ${question}\nCandidate response: ${response}\nMeasured delivery scores: ${JSON.stringify(analysis.scores)}`,
        { jsonOutput: true, numPredict: 220 }
      )
    );
    return coaching
      ? {
          ...analysis,
          strengths: coaching.strengths,
          improvements: coaching.improvements,
          scores: {
            ...analysis.scores,
            technicalCorrectness: coaching.technicalCorrectness || analysis.scores.technicalCorrectness
          },
          weakTopics: coaching.weakTopics.length ? coaching.weakTopics : analysis.weakTopics,
          aiPowered: true
        }
      : analysis;
  } catch (error) {
    console.error(error.message);
    return analysis;
  }
}

async function extractResumeText(base64Pdf) {
  if (!base64Pdf) throw new Error("Select a PDF resume first.");
  const bytes = Buffer.from(base64Pdf, "base64");
  if (!bytes.length || bytes.length > 5_000_000) throw new Error("Resume PDF must be smaller than 5 MB.");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: standardFontDirectory
  }).promise;
  const pages = [];
  for (let index = 1; index <= Math.min(document.numPages, 8); index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  const text = pages.join("\n").replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error("No readable resume text was found in this PDF.");
  return text.slice(0, 12000);
}

function fallbackResumeQuestions(resumeText, role) {
  const tech = ["JavaScript", "Python", "React", "Java", "AWS", "SQL", "Node", "Docker"].find((term) =>
    new RegExp(`\\b${term}\\b`, "i").test(resumeText)
  );
  const focus = tech || "a project listed on your resume";
  return [
    `Walk me through ${focus} experience that is most relevant to the ${role || "target"} role.`,
    `Describe a difficult technical decision you made while working with ${focus}. What trade-offs did you consider?`,
    "Choose one result from your resume. How did you measure your personal contribution?",
    "What would you improve if you rebuilt one of your resume projects today?",
    `Which skills in your background best prepare you for a ${role || "software engineering"} interview?`
  ];
}

function parseQuestionSet(text, fallback) {
  try {
    const data = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "");
    if (!Array.isArray(data.questions)) return null;
    const questions = data.questions.map((item) => sanitizeText(item, 240)).filter(Boolean).slice(0, 7);
    return questions.length ? { questions, topics: Array.isArray(data.topics) ? data.topics.slice(0, 5) : [] } : null;
  } catch {
    return null;
  }
}

async function createResumeQuestions(payload) {
  const role = sanitizeText(payload.role, 120);
  const resumeText = await extractResumeText(payload.pdfBase64);
  const fallback = fallbackResumeQuestions(resumeText, role);
  try {
    const output = await aiResponse(
      "You are a technical recruiter creating practice interview questions from a candidate resume. Respond only as JSON: {\"questions\":[\"...\"],\"topics\":[\"...\"]}. Produce 6 concise, specific questions grounded in named skills, projects, or achievements in the resume. Include technical depth and behavioral impact questions. Never invent details.",
      `Target role: ${role || "Software Engineer"}\nResume text:\n${resumeText}`,
      { jsonOutput: true, numPredict: 420 }
    );
    const parsed = parseQuestionSet(output, fallback);
    return { questions: parsed?.questions || fallback, topics: parsed?.topics || [], aiPowered: Boolean(parsed) };
  } catch (error) {
    console.error(error.message);
    return { questions: fallback, topics: [], aiPowered: false };
  }
}

function parseCodeReview(text) {
  try {
    const data = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "");
    if (!data || !Array.isArray(data.errors) || !Array.isArray(data.optimizations)) return null;
    const summary = sanitizeText(data.summary, 280);
    let score = clamp(Number(data.score) || 50);
    if (/\bcorrect\b/i.test(summary) && !/\bincorrect\b/i.test(summary) && score < 60) {
      score = 65;
    }
    return {
      score,
      summary,
      errors: data.errors.map((item) => sanitizeText(item, 200)).filter(Boolean).slice(0, 4),
      optimizations: data.optimizations.map((item) => sanitizeText(item, 200)).filter(Boolean).slice(0, 4),
      timeComplexity: sanitizeText(data.timeComplexity, 80) || "Not determined",
      spaceComplexity: sanitizeText(data.spaceComplexity, 80) || "Not determined"
    };
  } catch {
    return null;
  }
}

async function reviewCode(payload) {
  const language = sanitizeText(payload.language, 60) || "JavaScript";
  const prompt = sanitizeText(payload.problem, 1000);
  const code = sanitizeText(payload.code, 8000);
  if (!code) throw new Error("Paste your code before requesting a review.");
  try {
    const output = await aiResponse(
      "You are a coding interview reviewer. Respond only as JSON: {\"score\":0,\"summary\":\"...\",\"errors\":[\"...\"],\"optimizations\":[\"...\"],\"timeComplexity\":\"...\",\"spaceComplexity\":\"...\"}. Check correctness against the problem when provided, identify bugs, explain optimizations, and estimate Big-O complexity. Calibrate score fairly: a correct but non-optimal solution is typically 60-75; an optimal correct solution is 80-100; reserve scores below 50 for incorrect or substantially incomplete solutions. Be concise.",
      `Language: ${language}\nProblem: ${prompt || "Not provided; review general quality and complexity."}\nCandidate code:\n${code}`,
      { jsonOutput: true, numPredict: 480 }
    );
    const review = parseCodeReview(output);
    if (review) return { ...review, aiPowered: true };
  } catch (error) {
    console.error(error.message);
  }
  return {
    score: 55,
    summary: "A full AI code review is unavailable right now. Confirm correctness with test cases and explain the chosen complexity.",
    errors: ["Run normal, empty, and edge-case inputs before considering the solution complete."],
    optimizations: ["State time and space complexity, then look for unnecessary nested work or extra storage."],
    timeComplexity: "Review required",
    spaceComplexity: "Review required",
    aiPowered: false
  };
}

async function serveStatic(requestPath, response) {
  const pathname = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(directory, safePath);
  if (!filePath.startsWith(directory)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "POST" && url.pathname === "/api/answer") {
      sendJson(response, 200, await buildAnswer(await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/analyze") {
      sendJson(response, 200, await analyzeAnswer(await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/resume-questions") {
      sendJson(response, 200, await createResumeQuestions(await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/code-review") {
      sendJson(response, 200, await reviewCode(await readJson(request)));
      return;
    }
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    await serveStatic(decodeURIComponent(url.pathname), response);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Unable to process request." });
  }
});

server.listen(port, () => {
  console.log(`InterviewPulse is running at http://localhost:${port}`);
  console.log(`Ollama provider configured at ${ollamaBaseUrl} with model: ${ollamaModel}`);
  console.log("If Ollama is unavailable, built-in answer and scoring fallbacks remain active.");
});
