import sqlite3
import json
import os
import sys

# Assume the script is run from the project root
db_path = "data/evaluations.db"

if not os.path.exists(db_path):
    print(f"Database not found at {os.path.abspath(db_path)}. No migration needed.")
    sys.exit(0)

print(f"Connecting to {os.path.abspath(db_path)}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Add new columns using ALTER TABLE
new_columns = [
    ("final_score", "REAL"),
    ("score_relevance", "REAL"),
    ("score_accuracy", "REAL"),
    ("score_completeness", "REAL"),
    ("score_hallucination", "REAL")
]

for col_name, col_type in new_columns:
    try:
        cursor.execute(f"ALTER TABLE evaluations ADD COLUMN {col_name} {col_type}")
        print(f"Added column {col_name}")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e):
            print(f"Column {col_name} already exists. Skipping.")
        else:
            raise e

# 2. Add Indexes
try:
    cursor.execute("CREATE INDEX ix_evaluations_status ON evaluations (status)")
    print("Added index on status")
except sqlite3.OperationalError:
    pass

try:
    cursor.execute("CREATE INDEX ix_evaluations_created_at ON evaluations (created_at)")
    print("Added index on created_at")
except sqlite3.OperationalError:
    pass

# 3. Data Migration: Extract values from result_json
print("Migrating data from result_json to new columns...")
cursor.execute("SELECT id, result_json FROM evaluations WHERE status = 'completed' AND result_json IS NOT NULL")
rows = cursor.fetchall()

updated_count = 0
for row in rows:
    eval_id, result_json = row
    try:
        data = json.loads(result_json)
        final_score = data.get("final_score", None)
        breakdown = data.get("breakdown", {})
        
        score_relevance = breakdown.get("relevance", {}).get("score", None)
        score_accuracy = breakdown.get("accuracy", {}).get("score", None)
        score_completeness = breakdown.get("completeness", {}).get("score", None)
        score_hallucination = breakdown.get("hallucination", {}).get("score", None)
        
        cursor.execute("""
            UPDATE evaluations 
            SET final_score = ?, score_relevance = ?, score_accuracy = ?, score_completeness = ?, score_hallucination = ?
            WHERE id = ?
        """, (final_score, score_relevance, score_accuracy, score_completeness, score_hallucination, eval_id))
        
        updated_count += 1
    except Exception as e:
        print(f"Failed to migrate record {eval_id}: {e}")

conn.commit()
conn.close()
print(f"Migration completed successfully. Updated {updated_count} records.")
