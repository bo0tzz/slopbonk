import { sql } from 'kysely';
import type { Db } from '../db';
import type { OutboxAction } from '../db/schema/tables/outbox.table';
import { failedJobsQueue } from '../jobs';
import type { JobQueue } from '../queue';

export interface Overview {
	queues: { name: string; ready: number; deferred: number; active: number; failed: number }[];
	failedJobs: { queue: string; failedAt: Date; error: string; data: object }[];
	failedActions: {
		installation: string;
		action: OutboxAction;
		target: string;
		attempts: number;
		error: string | null;
		failedAt: Date | null;
	}[];
	installations: {
		id: number;
		login: string;
		type: string;
		installedAt: Date;
		uninstalledAt: Date | null;
		open: number;
		blocked: number;
		dismissed: number;
	}[];
	rateLimits: { installation: string; until: Date }[];
}

const RECENT_FAILURES = 50;

export async function overview(
	db: Db,
	queue: Pick<JobQueue, 'stats' | 'list' | 'find'>,
	rateLimits: { installationId: number; until: Date }[]
): Promise<Overview> {
	const [stats, failed, failedActions, installations] = await Promise.all([
		queue.stats(),
		queue.list(failedJobsQueue),
		db
			.selectFrom('outbox')
			.innerJoin('installations', 'installations.id', 'outbox.installation_id')
			.leftJoin('github_users', 'github_users.id', 'outbox.target_user_id')
			.select([
				'installations.account_login',
				'outbox.action',
				'github_users.login',
				'outbox.target_user_id',
				'outbox.attempts',
				'outbox.last_error',
				'outbox.completed_at'
			])
			.where('outbox.status', '=', 'failed')
			.orderBy('outbox.completed_at', 'desc')
			.limit(RECENT_FAILURES)
			.execute(),
		db
			.selectFrom('installations')
			.leftJoin('cases', 'cases.installation_id', 'installations.id')
			.select([
				'installations.id',
				'installations.account_login',
				'installations.account_type',
				'installations.installed_at',
				'installations.uninstalled_at',
				sql<number>`count(cases.id) filter (where cases.state = 'open')::int`.as('open'),
				sql<number>`count(cases.id) filter (where cases.state = 'blocked')::int`.as('blocked'),
				sql<number>`count(cases.id) filter (where cases.state = 'dismissed')::int`.as('dismissed')
			])
			.groupBy('installations.id')
			.orderBy('installations.account_login')
			.execute()
	]);
	const logins = new Map(installations.map((i) => [i.id, i.account_login]));

	return {
		queues: stats
			.filter((q) => q.name !== failedJobsQueue.name && !q.name.startsWith('__'))
			.map((q) => ({
				name: q.name,
				ready: q.readyCount,
				deferred: q.deferredCount,
				active: q.activeCount,
				failed: q.failedCount
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		failedJobs: await Promise.all(
			failed
				.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime())
				.slice(0, RECENT_FAILURES)
				.map(async (job) => {
					const original =
						job.sourceName && job.sourceId ? await queue.find(job.sourceName, job.sourceId) : null;
					return {
						queue: job.sourceName ?? 'unknown',
						failedAt: job.createdOn,
						error: original ? errorMessage(original.output) : 'unknown',
						data: job.data
					};
				})
		),
		failedActions: failedActions.map((a) => ({
			installation: a.account_login,
			action: a.action,
			target: a.login ?? String(a.target_user_id),
			attempts: a.attempts,
			error: a.last_error,
			failedAt: a.completed_at ? new Date(a.completed_at) : null
		})),
		installations: installations.map((i) => ({
			id: i.id,
			login: i.account_login,
			type: i.account_type,
			installedAt: new Date(i.installed_at),
			uninstalledAt: i.uninstalled_at ? new Date(i.uninstalled_at) : null,
			open: i.open,
			blocked: i.blocked,
			dismissed: i.dismissed
		})),
		rateLimits: rateLimits.map((hold) => ({
			installation: logins.get(hold.installationId) ?? String(hold.installationId),
			until: hold.until
		}))
	};
}

function errorMessage(output: unknown): string {
	const message = (output as { message?: unknown } | null)?.message;
	return typeof message === 'string' ? message : JSON.stringify(output);
}
