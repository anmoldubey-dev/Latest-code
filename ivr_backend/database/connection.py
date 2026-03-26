# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | create_engine()               |
# | * init MySQL connection pool  |
# +-------------------------------+
#     |
#     |----> pool_pre_ping=True  * detect stale connections
#     |
#     |----> pool_recycle=3600   * recycle connections hourly
#     |
#     v
# +-------------------------------+
# | sessionmaker()                |
# | * configure session factory   |
# +-------------------------------+
#     |
#     |----> autocommit=False    * manual transaction control
#     |
#     |----> autoflush=False     * explicit flush only
#     |
#     v
# +-------------------------------+
# | get_db()                      |
# | * yield DB session dependency |
# +-------------------------------+
#     |
#     |----> <SessionLocal> -> __call__() * open DB session
#     |
#     |----> yield db             * inject into route handler
#     |
#     |----> <db> -> close()      * cleanup on request end
#
# ================================================================

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "mysql+pymysql://root:root@127.0.0.1:3306/sr_comsoft_db"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
