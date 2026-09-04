from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.core import config
from backend.core.config import logger

try:
    logger.info("Initializing database connection...")
    engine = create_engine(
        config.DATABASE_URL, connect_args={"check_same_thread": False}
    )
    logger.info(f"Database engine created at {config.DATABASE_URL}")
except Exception as e:
    logger.error(f"Failed to initialize database: {e}")
    raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
