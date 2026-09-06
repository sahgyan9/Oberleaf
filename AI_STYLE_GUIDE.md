# AI Style Guide & Anti-Slop Standard

This document defines strict communication, UI, and coding standards for all AI agents and contributors working on this codebase. It establishes rules to eliminate "AI-ish" behavior, performative enthusiasm, and emoji clutter.

---

## 1. What is "AI-ish" Behavior?

Modern Large Language Models (LLMs) are RLHF-tuned to be agreeable, chatty, and visibly enthusiastic. In professional software development, this defaults to a pattern often termed **"AI slop"**:

1. **Emoji Clutter**: Defaulting to decorative emojis in UI buttons, toasts, commit messages, and technical explanations (`⚡`, `💡`, `✨`, `📦`, `🚀`, `👉`, `✅`). This communicates superficial novelty rather than production-grade engineering.
2. **Performative Sycophancy & Cheerleading**: Phrases like *"I'd be happy to help!"*, *"Awesome idea!"*, *"Excited to build this!"*, or excessive exclamation points.
3. **Lexical Clichés & Corporate Fluff**: Overusing predictable AI filler terms:
   - *"delve"*, *"tapestry"*, *"landscape"*, *"testament"*, *"seamless"*, *"game-changer"*, *"robust"*, *"plethora"*, *"leverage"*, *"multifaceted"*, *"navigating"*.
   - Structural formulas like *"Not just X, but Y"* or *"It's worth noting that..."*.
4. **Asymmetry of Effort**: Dumping large walls of generic text or multiple speculative options instead of diagnosing the root cause and delivering precise, verified solutions.

---

## 2. Core Directives for AI Agents

### A. UI Design & Copy
- **Zero Emojis in the UI**: Never place raw Unicode emojis in buttons, banners, toast messages, tooltips, or error cards.
- **Use Semantic SVG Icons Only**: Use Lucide icons (`Wrench`, `Copy`, `Info`, `AlertTriangle`, `Check`) styled consistently with the application's design system tokens.
- **Concise, Functional Button Labels**:
  - Write `Add \usepackage{amsmath}`, not `⚡ Add \usepackage{amsmath}`.
  - Write `Copy Prompt`, not `✨ Copy Prompt for AI`.
  - Write `Undo Fix`, not `↩ Undo Auto-Fix`.
- **Informative, Restrained Notifications**:
  - Write `"Added \usepackage{amsmath} to preamble. Recompiling..."`, not `"⚡ Added \usepackage{amsmath}! Recompiling..."`.
  - Write `"Compilation succeeded with 0 errors."`, not `"✨ Fixed! Document compiled successfully with 0 errors."`.

### B. Engineering Communication Tone
- **Direct & Matter-of-Fact**: Speak as a senior staff software engineer to a peer. State the facts, the diagnosis, and the code changes without artificial hype or cheerleading.
- **Explain Root Causes, Not Just Symptoms**: When a user experiences an error (e.g., 6 compiler errors for 1 missing package), explain the mechanics (e.g., TeX 79-column line wrapping and parser cascade) rather than treating each symptom as an independent bug.
- **No Filler**: Eliminate conversational filler (*"Sure thing!"*, *"Certainly!"*, *"Let's dive in!"*). Start directly with the answer or action.

---

## 3. TeX Compiler & Log Processing Standards

When writing or modifying LaTeX compilation tools in this repository:
1. **Unwrap 79-Column Hard-Wrapping**: TeX engines wrap error logs at 79 columns. Long file paths break error messages across lines (`LaTeX Error:\nEnvironment align undefined`). Always reconstruct continuation lines before displaying them.
2. **Prioritize the Root Error**: TeX cascades secondary syntax errors (`Misplaced alignment tab`, `Missing $ inserted`) whenever an environment fails. Always classify the first error as the **Root Cause** and label downstream errors as **Secondary Cascades** to prevent user confusion.
