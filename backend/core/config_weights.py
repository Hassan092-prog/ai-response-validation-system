import os
import json

WEIGHTS_FILE = os.path.join(os.path.dirname(__file__), "weights.json")

def get_global_weights():
    if os.path.exists(WEIGHTS_FILE):
        try:
            with open(WEIGHTS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"accuracy": 40, "relevance": 20, "completeness": 20, "hallucination": 20}

def set_global_weights(weights: dict):
    with open(WEIGHTS_FILE, "w") as f:
        json.dump(weights, f)
