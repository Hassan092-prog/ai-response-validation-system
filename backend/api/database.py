from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from backend.core import config

# Create the SQLAlchemy Engine pointing to our SQLite file
# check_same_thread is False because FastAPI might access the DB from multiple threads
engine = create_engine(
    config.DATABASE_URL, connect_args={"check_same_thread": False}
)

# A session factory to talk to the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All our database tables will inherit from this Base class
Base = declarative_base()

def get_db():
    """Dependency function to get a database session for a single request"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
