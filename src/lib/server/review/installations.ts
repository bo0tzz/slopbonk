import { sql } from 'kysely';
import { QUEUE_THRESHOLD } from '../constants';
import type { Db } from '../db';

export interface ReviewableInstallation {
	id: number;
	login: string;
	accountType: 'Organization' | 'User';
	toReview: number;
}

export async function reviewableInstallations(
	db: Db,
	installationIds: number[]
): Promise<ReviewableInstallation[]> {
	if (installationIds.length === 0) {
		return [];
	}
	const rows = await db
		.selectFrom('installations')
		.leftJoin('cases', (join) =>
			join
				.onRef('cases.installation_id', '=', 'installations.id')
				.on('cases.state', '=', 'open')
				.on('cases.score', '>=', QUEUE_THRESHOLD)
		)
		.select([
			'installations.id',
			'installations.account_login',
			'installations.account_type',
			sql<number>`count(cases.id)::int`.as('to_review')
		])
		.where('installations.id', 'in', installationIds)
		.where('installations.uninstalled_at', 'is', null)
		.groupBy('installations.id')
		.orderBy('installations.account_login')
		.execute();
	return rows.map((row) => ({
		id: row.id,
		login: row.account_login,
		accountType: row.account_type,
		toReview: row.to_review
	}));
}
