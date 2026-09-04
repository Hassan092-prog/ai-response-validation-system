import os
import logging
from pathlib import Path

# Base directories
# .parent goes to core/, .parent goes to backend/, .parent goes to root
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"

# Create data dir if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)

# Database Configurations
SQLITE_DB_PATH = DATA_DIR / "evaluations.db"
DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH}"

# ChromaDB Configurations
CHROMA_DB_DIR = DATA_DIR / "chroma_db"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Ingestion settings
CHUNK_SIZE = 512
CHUNK_OVERLAP = 50

# Logging Configuration
LOG_FILE = BASE_DIR / "app.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AI-Response-Validation")
