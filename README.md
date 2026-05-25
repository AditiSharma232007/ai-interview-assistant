# InterviewPulse

A real-time AI interview **practice** assistant that captures mock interview questions, prepares answer guides, reads them aloud, analyzes spoken responses, and keeps a local practice history.

## Features

- Speech-to-text capture for questions and candidate responses using the browser Web Speech API.
- Text-to-speech playback for generated answer guides.
- Local Ollama-generated answer guidance and personalized written coaching.
- Confidence, grammar, communication, technical-correctness, filler-word, pace, and word-count feedback.
- Resume PDF upload that generates role-specific practice questions locally through Ollama.
- Coding-round review for errors, optimization ideas, correctness score, and Big-O analysis.
- Dashboard metrics for overall interview score, technical score, weak topics, and practice history.
- Offline fallback guidance and basic scoring when Ollama is unavailable.
- Recent attempt history stored only in browser `localStorage`.

Use this tool for practice sessions or interviews where assistance has been disclosed and permitted.

## Run Locally

Requirements: Node.js 20 or newer and Ollama running locally.

```powershell
npm install
npm start
```


## Ollama AI Responses

The server uses your local Ollama instance by default:

```powershell
npm start
```

Default configuration:

```text
Endpoint: http://127.0.0.1:11434
Model:    llama3.2:3b
```

Use a different installed model or Ollama server with environment variables:

```powershell
$env:OLLAMA_MODEL="llama3.1:8b"
$env:OLLAMA_BASE_URL="http://127.0.0.1:11434"
npm start
```

When the Ollama API is not available, the app continues using built-in answer frameworks and rules-based scoring.

## Use The Advanced Features

### Technical Feedback

Set the role to `Software Engineer`, choose `Technical`, enter a question, answer it, and click **Analyze response**. The feedback panel includes technical correctness and adds weak topics to your dashboard.

### Resume Questions

Under **Resume Mode**, choose a text-based PDF resume smaller than 5 MB and click **Generate resume questions**. Click any generated question to move it into the live interview practice area.

The PDF content is read only on your local server for the current request. The app stores practice results, not resume text.

### Coding Round

Under **Coding Round**, select a language, enter the coding challenge, paste your solution, and click **Review code**. Ollama returns correctness feedback, risks, optimization ideas, and estimated time and space complexity.

## Project Structure

```text
public/
  index.html       App markup
  styles.css       Responsive interface styling
  app.js           Speech, resume/coding workflows, history and rendering
server.mjs         Static server, Ollama routes, PDF extraction, fallback scoring
```

## Verify

```powershell
npm run check
```
## Website 
https://ai-interview-assistant-96ru.onrender.com/
