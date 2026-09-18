from .utils import _call_llm_json, logger

def generate_verdict(question: str, ai_response: str, relevance_res: dict, accuracy_res: dict, completeness_res: dict, hallucination_res: dict) -> dict:
    """Combines all agent evaluations into a final weighted verdict with a consolidated reasoning summary."""
    try:
        # 1. Extract raw scores (Fallback to 0 if something failed)
        r_score = relevance_res.get("score", 0)
        a_score = accuracy_res.get("score", 0)
        c_score = completeness_res.get("score", 0)
        h_score = hallucination_res.get("score", 0)
        
        # 2. Weighted Scoring Model (out of 100)
        # Relevance: 20%, Accuracy: 40%, Completeness: 20%, Hallucination: 20%
        # (Score / 5) * Weight
        r_points = (r_score / 5.0) * 20
        a_points = (a_score / 5.0) * 40
        c_points = (c_score / 5.0) * 20
        h_points = (h_score / 5.0) * 20
        
        final_score = round(r_points + a_points + c_points + h_points, 1)
        
        # 3. Determine Verdict Category
        verdict = "Pass"
        if final_score < 50 or h_score <= 2 or a_score <= 1:
            # Automatic fail rules for severe hallucinations or complete inaccuracy
            verdict = "Fail"
        elif final_score < 80:
            verdict = "Needs Improvement"
            
        # 4. Generate Consolidated Summary via LLM
        system_prompt = (
            "You are the Lead Verdict Judge for an AI Evaluation system. "
            "You will be provided with the raw reasoning notes from four sub-agents (Relevance, Accuracy, Completeness, Hallucination). "
            "Your job is to read their notes and synthesize a clear, executive summary of the AI's overall performance. "
            "Output JSON exactly in this format:\n"
            "{\n"
            "  \"major_issues\": [\"Issue 1\", \"Issue 2\"],\n"
            "  \"consolidated_reasoning\": \"<A 2-3 sentence executive summary explaining why it passed or failed based on the sub-agent notes>\"\n"
            "}"
        )
        
        user_prompt = f"""
Question: {question}
AI Response: {ai_response}

[Sub-Agent Notes]
Relevance (Score {r_score}/5): {relevance_res.get('reasoning', '')}
Accuracy (Score {a_score}/5): {accuracy_res.get('reasoning', '')}
Completeness (Score {c_score}/5): {completeness_res.get('reasoning', '')}
Hallucination Penalty (Score {h_score}/5): {hallucination_res.get('reasoning', '')}
"""
        
        llm_summary = _call_llm_json(system_prompt, user_prompt)
        
        # Format Supporting Evidence & Missing Aspects for UI compatibility
        a_reasoning = accuracy_res.get("reasoning", "")
        supporting_evidence = accuracy_res.get("supporting_evidence", "")
        if supporting_evidence:
            a_reasoning += f"\n\n**Supporting Evidence:**\n> {supporting_evidence}"

        c_reasoning = completeness_res.get("reasoning", "")
        missing = completeness_res.get("missing_aspects", [])
        if missing:
            c_reasoning += f"\n\n**Missing Aspects:**\n- " + "\n- ".join(missing)

        return {
            "final_score": final_score,
            "verdict": verdict,
            "major_issues": llm_summary.get("major_issues", []),
            "consolidated_reasoning": llm_summary.get("consolidated_reasoning", "Evaluation complete."),
            "breakdown": {
                "relevance": {"score": r_score, "reasoning": relevance_res.get("reasoning", "")},
                "accuracy": {"score": a_score, "reasoning": a_reasoning},
                "completeness": {"score": c_score, "reasoning": c_reasoning},
                "hallucination": {"score": h_score, "reasoning": hallucination_res.get("reasoning", "")}
            }
        }
    except Exception as e:
        logger.error(f"Error computing verdict agent: {e}")
        return {"final_score": 0, "verdict": "Fail", "error": "Failed to compute verdict."}
