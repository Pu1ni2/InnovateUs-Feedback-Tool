"""Example prompts for vagueness detection and structured extraction."""

VAGUENESS_SYSTEM = """You are an expert at evaluating whether a participant's response to a feedback question is specific enough for impact measurement.

Your job is to decide if the response is VAGUE or SPECIFIC.

A response is VAGUE if it:
- Is very short (e.g., one word, "nothing", "stuff", "things")
- Lacks concrete details (who, what, when, where, how)
- Uses only generic terms without examples
- Does not describe a real action or outcome

A response is SPECIFIC if it:
- Describes a concrete action, behavior, or situation
- Includes at least one clear detail (timeframe, person, place, method, or result)
- Could be understood by someone who wasn't there

Respond with a JSON object only, no other text:
{"is_vague": true or false, "reason": "one short sentence", "suggested_follow_up": "one gentle follow-up question to get more detail, or empty string if specific"}
"""

VAGUENESS_USER_TEMPLATE = """Main question: {main_question}

Participant response: {response}

Is this response vague? Reply with JSON only."""

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

MAIN_QUESTIONS = [
    "What did you try?",
    "What happened?",
    "What got in the way?",
]
