import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Db } from '.';

const migrationProvider: MigrationProvider = {
	async getMigrations() {
		const modules = import.meta.glob<Migration>('./migrations/*.ts', { eager: true });
		return Object.fromEntries(
			Object.entries(modules).map(([path, migration]) => [
				path.replace(/^.*\//, '').replace(/\.ts$/, ''),
				migration
			])
		);
	}
};

export function migrator(db: Db): Migrator {
	return new Migrator({
		db,
		provider: migrationProvider,
		migrationTableName: 'kysely_migrations',
		migrationLockTableName: 'kysely_migrations_lock'
	});
}

export async function migrateToLatest(db: Db): Promise<void> {
	const { error, results } = await migrator(db).migrateToLatest();
	for (const result of results ?? []) {
		if (result.status === 'Error') {
			console.error(`Migration ${result.migrationName} failed`);
		}
	}
	if (error) {
		throw error;
	}
}
