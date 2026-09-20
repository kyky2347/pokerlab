from alembic import context
from sqlalchemy import create_engine, pool

from pokerlab_api.config import get_settings
from pokerlab_api.database import Base

config = context.config


def migrate(connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata, transactional_ddl=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=Base.metadata,
        literal_binds=True,
        transactional_ddl=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    supplied_connection = config.attributes.get("connection")
    if supplied_connection is not None:
        migrate(supplied_connection)
    else:
        engine = create_engine(get_settings().database_url, poolclass=pool.NullPool)
        with engine.begin() as connection:
            if connection.dialect.name == "sqlite":
                connection.exec_driver_sql("BEGIN IMMEDIATE")
            migrate(connection)
        engine.dispose()
