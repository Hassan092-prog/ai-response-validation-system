import os
import sqlite3
import sys

# Add project root to sys.path so we can import backend modules
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(project_root)

db_path = os.path.join(project_root, "data", "evaluations.db")


def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}. No migration needed.")
        return

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Add batch webhook columns to evaluations table if not present
    new_cols = [
        ("batch_webhook_url", "TEXT"),
        ("batch_webhook_secret_hash", "TEXT")
    ]

    for col_name, col_type in new_cols:
        try:
            cursor.execute(f"ALTER TABLE evaluations ADD COLUMN {col_name} {col_type}")
            print(f"Added column to evaluations: {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column '{col_name}' already exists in evaluations. Skipping.")
            else:
                raise e

    # 2. Create golden_benchmarks table if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS golden_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        batch_id TEXT NOT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        avg_final_score REAL NOT NULL,
        avg_accuracy REAL NOT NULL,
        avg_relevance REAL NOT NULL,
        avg_completeness REAL NOT NULL,
        avg_hallucination REAL NOT NULL,
        pass_rate REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    print("Verified/created table: golden_benchmarks")

    cursor.execute("CREATE INDEX IF NOT EXISTS ix_golden_benchmarks_name ON golden_benchmarks (name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_golden_benchmarks_batch_id ON golden_benchmarks (batch_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_golden_benchmarks_created_at ON golden_benchmarks (created_at)")
    print("Verified/created indexes for golden_benchmarks")

    conn.commit()
    conn.close()
    print("Benchmark & Webhook migration completed successfully.")


if __name__ == "__main__":
    migrate()

