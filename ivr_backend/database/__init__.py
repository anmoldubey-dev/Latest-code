# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# database * SQLAlchemy database module namespace
#   |
#   |----> connection * MySQL engine and session factory
#           |
#           |----> get_db() * FastAPI dependency injector
#           |
#           |----> Base * Declarative ORM base class
#
# ================================================================
