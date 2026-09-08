import sys
import os
# Add project root to path so we can import 'backend'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from backend.core.agents.relevance import evaluate_relevance
from backend.core.agents.accuracy import evaluate_accuracy
from backend.core.agents.hallucination import detect_hallucination

TEST_CASES = [
    {
        "id": "TC-1-Perfect",
        "question": "What is the capital of France?",
        "context": "Paris is the capital and most populous city of France.",
        "ai_response": "The capital of France is Paris.",
        "expected_relevance": 5,
        "expected_accuracy": 5,
        "expected_hallucination_score": 0
    },
    {
        "id": "TC-2-OffTopic",
        "question": "How do you bake a cake?",
        "context": "Baking a cake requires flour, sugar, eggs, and butter baked at 350 degrees.",
        "ai_response": "I like playing video games on weekends.",
        "expected_relevance": 1,
        "expected_accuracy": 1,
        "expected_hallucination_score": 5
    },
    {
        "id": "TC-3-Contradiction",
        "question": "Is cracking knuckles bad for you?",
        "context": "Medical studies show no link between cracking knuckles and arthritis. It is harmless.",
        "ai_response": "Cracking your knuckles is very bad for you and will cause permanent arthritis.",
        "expected_relevance": 4,  # Addresses the question, but gives wrong answer
        "expected_accuracy": 1,
        "expected_hallucination_score": 5 # Should flag a claim
    }
]

def run_validation():
    print("==========================================")
    print("   AI AGENT CONSISTENCY VALIDATION SUITE  ")
    print("==========================================\n")
    
    for tc in TEST_CASES:
        print(f"Running Test Case: {tc['id']}")
        print(f"Q: {tc['question']}")
        print(f"A: {tc['ai_response']}\n")
        
        # Test Relevance
        print("-> Testing Relevance Judge...")
        rel_res = evaluate_relevance(tc['question'], tc['ai_response'])
        rel_score = rel_res.get('score')
        rel_pass = "PASS" if rel_score == tc['expected_relevance'] else f"FAIL (Expected {tc['expected_relevance']})"
        print(f"   Score: {rel_score} | {rel_pass}")
        print(f"   Reasoning: {rel_res.get('reasoning')}\n")
        
        # Test Accuracy
        print("-> Testing Accuracy Judge...")
        acc_res = evaluate_accuracy(tc['question'], tc['ai_response'], tc['context'])
        acc_score = acc_res.get('score')
        acc_pass = "PASS" if acc_score == tc['expected_accuracy'] else f"FAIL (Expected {tc['expected_accuracy']})"
        print(f"   Score: {acc_score} | {acc_pass}")
        print(f"   Evidence: {acc_res.get('supporting_evidence')}\n")
        
        # Test Hallucination
        print("-> Testing Hallucination Detector...")
        hal_res = detect_hallucination(tc['ai_response'], tc['context'])
        hal_score = hal_res.get('score')
        hal_pass = "PASS" if hal_score == tc['expected_hallucination_score'] else f"FAIL (Expected {tc['expected_hallucination_score']})"
        print(f"   Score: {hal_score} | {hal_pass}")
        
        flagged = hal_res.get('flagged_claims', [])
        print(f"   Flagged Claims: {len(flagged)}")
        for claim in flagged:
            print(f"      - \"{claim.get('statement')}\" ({claim.get('status')}): {claim.get('explanation')}")
            
        print("\n" + "-"*40 + "\n")

if __name__ == "__main__":
    run_validation()
