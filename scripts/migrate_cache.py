import sys
import os
import sqlite3

# Add project root to sys.path so we can import backend modules
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

from backend.core.cache import compute_input_hash

db_path = os.path.join(project_root, "data", "evaluations.db")

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}. No migration needed.")
        return

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Add new columns
    new_cols = [
        ("input_hash", "TEXT"),
        ("is_cached", "INTEGER DEFAULT 0")
    ]

    for col_name, col_type in new_cols:
        try:
            cursor.execute(f"ALTER TABLE evaluations ADD COLUMN {col_name} {col_type}")
            print(f"Added column: {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column '{col_name}' already exists. Skipping.")
            else:
                raise e

    # 2. Add Index on input_hash
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_evaluations_input_hash ON evaluations (input_hash)")
        print("Created index: ix_evaluations_input_hash")
    except sqlite3.OperationalError:
        pass

    # 3. Backfill input_hash for existing records
    print("Backfilling input_hash for existing records...")
    cursor.execute("SELECT id, question, ai_response, reference_answer, source_document FROM evaluations WHERE input_hash IS NULL")
    rows = cursor.fetchall()

    updated = 0
    for row in rows:
        record_id, question, ai_response, reference_answer, source_document = row
        h = compute_input_hash(question, ai_response, reference_answer, source_document)
        cursor.execute("UPDATE evaluations SET input_hash = ? WHERE id = ?", (h, record_id))
        updated += 1

    conn.commit()
    conn.close()
    print(f"Cache migration completed successfully. Updated {updated} records.")

if __name__ == "__main__":
    migrate()

