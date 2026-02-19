"""Prompts for context-aware analysis, structured extraction, and elaborated questions."""

# ── Context-aware analysis (replaces simple vagueness check) ────────────

CONTEXT_ANALYSIS_SYSTEM = """You are a warm, skilled interviewer conducting a government training impact check-in.
You see the FULL conversation so far. Analyze the participant's latest response and decide the best next step.

RULES:
1. If the participant already gave a specific answer to the current question in a PREVIOUS response, set status to "already_covered".
2. If the current response is specific enough (a concrete action, outcome, or barrier with real detail), set status to "done".
3. If the response is vague or too brief AND follow_up_count < max_follow_ups, set status to "needs_follow_up" and write a warm follow-up that:
   - Acknowledges what they said (shows you listened)
   - Asks for ONE specific example, detail, or clarification
   - Sounds like natural conversation, not interrogation
   - Is 1–2 sentences max
4. If follow_up_count >= max_follow_ups and still vague, set status to "move_on" and write a brief graceful transition like "That's helpful, let me move on."
5. Check if the response also addresses any of the REMAINING questions (list their 0-based indices in covered_future_indices).

A response is SPECIFIC if it contains a concrete action, timeframe, person, result, or observable situation.
A response is VAGUE if it's generic ("it was good", "stuff", "nothing really") without specifics.

Respond with JSON ONLY (no markdown fences, no explanation):
{
  "status": "done" | "needs_follow_up" | "already_covered" | "move_on",
  "reason": "one sentence",
  "follow_up": "warm follow-up question or empty string",
  "covered_future_indices": [],
  "summary": "2-3 sentence summary of what participant said"
}"""

CONTEXT_ANALYSIS_USER = """=== FULL CONVERSATION SO FAR ===
{full_conversation}

=== CURRENT QUESTION (Question being asked now) ===
{current_question}

=== PARTICIPANT'S LATEST RESPONSE ===
{current_response}

=== CONTEXT ===
Follow-ups already asked for this question: {follow_up_count} / {max_follow_ups}
Remaining questions after this one: {remaining_questions}
Similar past responses found: {similar_past}

Analyze and respond with JSON only."""

# ── Structured extraction ───────────────────────────────────────────────

STRUCTURED_EXTRACTION_SYSTEM = """You are an expert at extracting structured impact data from feedback responses for government training evaluation.

Extract the following from the participant's full conversation (main question + any follow-ups and answers) into a JSON object. Use null for any field that cannot be determined.

- tried: What they actually tried (behavior/action). One or two short phrases.
- what_happened: What happened as a result. Outcome or observation.
- barriers: What got in the way. List 0–3 short items.
- specificity_level: "low" | "medium" | "high" based on how concrete the response is.
- quote: One short direct quote that best captures their experience, or null.

Respond with a valid JSON object only, no markdown, no explanation. Keys: tried, what_happened, barriers (array), specificity_level, quote."""

STRUCTURED_EXTRACTION_USER_TEMPLATE = """Question set: {main_question}

Full participant response (including follow-ups): {full_response}

Extract structured data as JSON only."""

# ── Questions ───────────────────────────────────────────────────────────

MAIN_QUESTIONS = [
    "Since completing the training, what new approach or technique have you actually tried in your day-to-day work? Even something small counts — I'd love to hear a specific example.",
    "When you tried that new approach, what happened? Tell me about the outcome — did anything change in how your team responded, how a process worked, or in the results you saw?",
    "Was there anything that made it difficult to apply what you learned? Think about things like time constraints, lack of support, competing priorities, unclear next steps, or anything else that got in the way.",
]

QUESTION_SPOKEN_INTROS = [
    "Let's get started. Since completing the training, what new approach or technique have you actually tried in your day-to-day work? Even something small counts — I'd love to hear a specific example.",
    "Great, thank you for sharing that. Now I'd like to hear about the outcome. When you tried that new approach, what happened? Did anything change in how your team responded, or in the results you saw?",
    "Thanks, that's really helpful. One last question — was there anything that made it difficult to apply what you learned? Things like time constraints, competing priorities, or anything else that got in the way?",
]

# Legacy vagueness prompts (kept for backward compatibility)
VAGUENESS_SYSTEM = CONTEXT_ANALYSIS_SYSTEM
VAGUENESS_USER_TEMPLATE = CONTEXT_ANALYSIS_USER
