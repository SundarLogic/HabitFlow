#!/bin/sh
# Runs once, on first initialisation of an empty data volume.
# Creates the dev and test databases (idempotent) owned by POSTGRES_USER.
set -eu

for db in "$POSTGRES_DEV_DB" "$POSTGRES_TEST_DB"; do
  echo "Ensuring database '$db' exists"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
	SELECT 'CREATE DATABASE "$db" OWNER "$POSTGRES_USER"'
	WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$db')\gexec
	ALTER DATABASE "$db" SET timezone TO 'UTC';
SQL
done
