import sys
import os
import argparse

# Add project root to path so we can import 'backend'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.core.agents.relevance import evaluate_relevance
from backend.core.agents.accuracy import evaluate_accuracy
from backend.core.agents.hallucination import detect_hallucination

TEST_CASES = [
    {
        "id": "TC-1-Perfect",
        "question": "What is the capital of France?",
        "context": "Paris is the capital and most populous city of France.",
        "ai_response": "The capital of France is Paris.",
        "min_relevance": 4,
        "min_accuracy": 4,
        "min_hallucination": 4  # 5 = perfect, no hallucination
    },
    {
        "id": "TC-2-OffTopic",
        "question": "How do you bake a cake?",
        "context": "Baking a cake requires flour, sugar, eggs, and butter baked at 350 degrees.",
        "ai_response": "I like playing video games on weekends.",
        "max_relevance": 2,
        "max_accuracy": 2
    },
    {
        "id": "TC-3-Contradiction",
        "question": "Is cracking knuckles bad for you?",
        "context": "Medical studies show no link between cracking knuckles and arthritis. It is harmless.",
        "ai_response": "Cracking your knuckles is very bad for you and will cause permanent arthritis.",
        "min_relevance": 3,  # Relevant to topic
        "max_accuracy": 2,   # Factually wrong based on context
        "max_hallucination": 2  # Severe contradiction / hallucination
    }
]

def run_validation(verbose=True) -> bool:
    print("==========================================")
    print("   AI AGENT CONSISTENCY VALIDATION SUITE  ")
    print("==========================================\n")
    
    all_passed = True
    
    for tc in TEST_CASES:
        print(f"Running Test Case: {tc['id']}")
        print(f"Q: {tc['question']}")
        print(f"A: {tc['ai_response']}\n")
        
        # Test Relevance
        print("-> Testing Relevance Judge...")
        rel_res = evaluate_relevance(tc['question'], tc['ai_response'])
        rel_score = rel_res.get('score', 0)
        
        rel_pass = True
        if "min_relevance" in tc and rel_score < tc["min_relevance"]:
            rel_pass = False
        if "max_relevance" in tc and rel_score > tc["max_relevance"]:
            rel_pass = False
            
        print(f"   Score: {rel_score}/5 | {'PASS' if rel_pass else 'FAIL'}")
        if verbose:
            print(f"   Reasoning: {rel_res.get('reasoning')}\n")
            
        # Test Accuracy
        print("-> Testing Accuracy Judge...")
        acc_res = evaluate_accuracy(tc['question'], tc['ai_response'], tc['context'])
        acc_score = acc_res.get('score', 0)
        
        acc_pass = True
        if "min_accuracy" in tc and acc_score < tc["min_accuracy"]:
            acc_pass = False
        if "max_accuracy" in tc and acc_score > tc["max_accuracy"]:
            acc_pass = False
            
        print(f"   Score: {acc_score}/5 | {'PASS' if acc_pass else 'FAIL'}")
        if verbose:
            print(f"   Evidence: {acc_res.get('supporting_evidence')}\n")
            
        # Test Hallucination
        print("-> Testing Hallucination Detector...")
        hal_res = detect_hallucination(tc['ai_response'], tc['context'])
        hal_score = hal_res.get('score', 0)
        
        hal_pass = True
        if "min_hallucination" in tc and hal_score < tc["min_hallucination"]:
            hal_pass = False
        if "max_hallucination" in tc and hal_score > tc["max_hallucination"]:
            hal_pass = False
            
        print(f"   Score: {hal_score}/5 | {'PASS' if hal_pass else 'FAIL'}")
        flagged = hal_res.get('flagged_claims', [])
        print(f"   Flagged Claims: {len(flagged)}")
        for claim in flagged:
            print(f"      - \"{claim.get('statement')}\" ({claim.get('status')}): {claim.get('explanation')}")
            
        if not (rel_pass and acc_pass and hal_pass):
            all_passed = False
            
        print("\n" + "-"*40 + "\n")
        
    return all_passed

def main():
    parser = argparse.ArgumentParser(description="Validate AI judge agents against baseline test cases.")
    parser.add_argument("--quiet", action="store_true", help="Suppress detailed reasoning logs")
    args = parser.parse_args()
    
    success = run_validation(verbose=not args.quiet)
    if not success:
        print("[!] Validation failed on one or more test cases.")
        sys.exit(1)
    else:
        print("[+] All validation test cases passed successfully.")
        sys.exit(0)

if __name__ == "__main__":
    main()
