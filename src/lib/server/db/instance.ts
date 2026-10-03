import { databaseUrl } from '../env';
import { createDb, type Db } from '.';

let db: Db | undefined;

export function getDb(): Db {
	db ??= createDb(databaseUrl());
	return db;
}
