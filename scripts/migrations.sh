#!/usr/bin/env bash
# Generates or checks migrations by diffing the sql-tools schema classes against a throwaway
# database that has had all existing migrations applied.
set -euo pipefail

command=$1
name=${2:-}
migrations=src/lib/server/db/migrations

tsc -p tsconfig.schema.json
mkdir -p .sql-tools/migrations

temp_db="slopbonk_migrations_$(date +%s)_$$"
temp_url="${DATABASE_URL%/*}/$temp_db"
sql-tools -u "$DATABASE_URL" query "CREATE DATABASE $temp_db" > /dev/null
trap 'sql-tools -u "$DATABASE_URL" query "DROP DATABASE IF EXISTS $temp_db" > /dev/null' EXIT

sql-tools -u "$temp_url" -f .sql-tools/migrations migrations run > /dev/null

case $command in
	generate)
		before=$(ls "$migrations")
		sql-tools -u "$temp_url" migrations generate --schemaDist .sql-tools/schema "$migrations/$name"
		for file in $(comm -13 <(echo "$before") <(ls "$migrations")); do
			prettier --write "$migrations/$file" > /dev/null
		done
		;;
	check)
		out=.sql-tools/pending
		rm -rf "$out" && mkdir -p "$out"
		sql-tools -u "$temp_url" migrations generate --schemaDist .sql-tools/schema "$out/Pending"
		if [ -n "$(ls "$out")" ]; then
			echo "The schema classes have changes that no migration covers:" >&2
			cat "$out"/* >&2
			exit 1
		fi
		;;
	*)
		echo "usage: $0 generate <name> | check" >&2
		exit 2
		;;
esac
