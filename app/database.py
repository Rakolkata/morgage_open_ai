from __future__ import annotations

import logging
from typing import Any, Optional

import psycopg2
from psycopg2 import sql

from app.config import get_settings

logger = logging.getLogger(__name__)


def get_admin_connection():
    """Connect to the default administrative 'postgres' maintenance database."""
    settings = get_settings()
    conn = psycopg2.connect(
        dbname="postgres",
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        connect_timeout=5,
    )
    conn.autocommit = True
    return conn


def get_app_connection():
    """Connect to the application database configured in .env (DB_NAME)."""
    settings = get_settings()
    conn = psycopg2.connect(
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        host=settings.db_host,
        port=settings.db_port,
        connect_timeout=5,
    )
    conn.autocommit = True
    return conn


def init_db() -> bool:
    """
    Check and initialize PostgreSQL database and table on server startup:
    1. If the database is not found, creates the database.
    2. If the table is not found, creates the table.
    3. If both exist, skips creation.
    """
    settings = get_settings()
    db_name = settings.db_name
    table_name = settings.db_table

    logger.info("Checking PostgreSQL initialization (DB: '%s', Table: '%s')...", db_name, table_name)

    try:
        # Step 1: Check if database exists
        admin_conn = get_admin_connection()
        try:
            with admin_conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (db_name,))
                db_exists = cur.fetchone() is not None

                if not db_exists:
                    logger.info("Database '%s' not found. Creating database...", db_name)
                    cur.execute(sql.SQL("CREATE DATABASE {};").format(sql.Identifier(db_name)))
                    logger.info("Database '%s' created successfully.", db_name)
                else:
                    logger.info("Database '%s' already exists.", db_name)
        finally:
            admin_conn.close()

        # Step 2: Check if table exists in target database
        app_conn = get_app_connection()
        try:
            with app_conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = %s;
                    """,
                    (table_name,),
                )
                table_exists = cur.fetchone() is not None

                if not table_exists:
                    logger.info("Table '%s' not found in database '%s'. Creating table...", table_name, db_name)
                    create_query = sql.SQL(
                        """
                        CREATE TABLE {} (
                            id SERIAL PRIMARY KEY,
                            agent VARCHAR(100) NOT NULL,
                            message TEXT NOT NULL,
                            response TEXT,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                        );
                        """
                    ).format(sql.Identifier(table_name))
                    cur.execute(create_query)
                    logger.info("Table '%s' created successfully in database '%s'.", table_name, db_name)
                else:
                    logger.info("Table '%s' already exists in database '%s'. Skipping creation.", table_name, db_name)
        finally:
            app_conn.close()

        logger.info("PostgreSQL database '%s' and table '%s' are ready.", db_name, table_name)
        return True

    except psycopg2.OperationalError as exc:
        logger.warning(
            "Could not connect to PostgreSQL on %s:%s. "
            "Please check if PostgreSQL is running and DB_USER/DB_PASSWORD in .env are correct. "
            "Error: %s",
            settings.db_host,
            settings.db_port,
            exc,
        )
        return False
    except Exception as exc:
        logger.error("Unexpected error during database initialization: %s", exc)
        return False


def save_chat_log(message: str, agent: str = "chat", response: Optional[str] = None) -> bool:
    """
    Store the request message, agent, response, and current timestamp into the PostgreSQL database.
    """
    settings = get_settings()
    table_name = settings.db_table

    try:
        conn = get_app_connection()
        try:
            with conn.cursor() as cur:
                query = sql.SQL(
                    """
                    INSERT INTO {} (agent, message, response, created_at)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP);
                    """
                ).format(sql.Identifier(table_name))
                cur.execute(query, (agent, message, response))
            logger.info("Saved request to PostgreSQL (DB: '%s', Table: '%s', Agent: '%s').", settings.db_name, table_name, agent)
            return True
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Failed to store chat log in PostgreSQL: %s", exc)
        return False
