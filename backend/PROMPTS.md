# Example Prompts for InnovateUS Impact Check-In

This document describes the AI prompts used for vagueness detection and structured extraction. The actual prompt text is in `prompts.py`; this file is for reference and tuning.

---

## Vagueness detection (GPT-4.1 nano)

**Purpose:** Decide if a participant’s answer is too vague for impact measurement and, if so, suggest one follow-up question.

**When it runs:** After each submitted response (main or follow-up). The app enforces a maximum of 2 AI follow-up questions per main question.

**Output:** JSON with:
- `is_vague`: boolean
- `reason`: short explanation
- `suggested_follow_up`: one follow-up question, or empty if the response is specific enough

**Tuning tips:**
- To be stricter (more follow-ups), tighten the “SPECIFIC” criteria in the system prompt.
- To reduce follow-ups, relax the “VAGUE” criteria or ask for “at least two concrete details” for SPECIFIC.

---

## Structured extraction (GPT-4.1)

**Purpose:** Turn the full conversation for a question (main + any follow-ups and answers) into a structured summary for analysis.

**When it runs:** After the participant has finished answering a main question (and any follow-ups), before moving to the next main question.

**Output:** JSON with:
- `tried`: What they tried (behavior/action)
- `what_happened`: Result or outcome
- `barriers`: List of what got in the way
- `specificity_level`: "low" | "medium" | "high"
- `quote`: One representative quote or null

**Tuning tips:**
- Add or remove fields in the system prompt and in the frontend/backend that consume this JSON.
- For other question sets, change the extraction instructions to match the new questions.

---

## Guided questions (fixed in code)

The three main questions are:

1. What did you try?
2. What happened?
3. What got in the way?

They are defined in `prompts.py` as `MAIN_QUESTIONS`. Change that list to alter or reorder questions.
