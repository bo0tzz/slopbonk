import { PgBoss, type Job, type JobWithMetadata, type Queue, type SendOptions } from 'pg-boss';

export type QueueOptions = Omit<Queue, 'name'>;

export interface QueueDefinition<T extends object> {
	name: string;
	options: QueueOptions;
	/** Jobs in the same group run one at a time; different groups run side by side. */
	groupBy?(data: T): string;
	/** Never set; carries the payload type. */
	readonly payload?: T;
}

export function defineQueue<T extends object>(
	name: string,
	options: QueueOptions = {},
	groupBy?: (data: T) => string
): QueueDefinition<T> {
	return { name, options, groupBy };
}

export interface Worker<T extends object> {
	queue: QueueDefinition<T>;
	handle(job: Job<T>): Promise<void>;
}

export function worker<T extends object>(
	queue: QueueDefinition<T>,
	handle: (job: Job<T>) => Promise<void>
): Worker<T> {
	return { queue, handle };
}

/** How many groups of a grouped queue this process works on at once. */
const GROUPS_IN_PARALLEL = 4;

export class JobQueue {
	constructor(private readonly boss: PgBoss) {}

	/** Returns the job id, or null when the queue's policy dropped the job as a duplicate. */
	send<T extends object>(
		queue: QueueDefinition<T>,
		data: T,
		options?: SendOptions
	): Promise<string | null> {
		const group = queue.groupBy ? { group: { id: queue.groupBy(data) } } : {};
		return this.boss.send(queue.name, data, { ...options, ...group });
	}

	/** Sends a job on the cron schedule; a run missed while the app was down is made up once. */
	schedule<T extends object>(queue: QueueDefinition<T>, cron: string, data: T): Promise<void> {
		return this.boss.schedule(queue.name, cron, data, { missed: 'once' });
	}

	stop(): Promise<void> {
		return this.boss.stop({ graceful: true });
	}
}

/** What components need to hand work to each other. */
export type JobSender = Pick<JobQueue, 'send'>;

export interface QueueBehaviour {
	/** When a job that failed this way should run again instead of counting as a failure. */
	deferUntil(error: unknown): Date | null;
}

export async function startQueue(
	connectionString: string,
	queues: QueueDefinition<object>[],
	createWorkers: (queue: JobQueue) => Worker<object>[],
	{ deferUntil }: QueueBehaviour
): Promise<JobQueue> {
	const boss = new PgBoss(connectionString);
	boss.on('error', (error) => console.error('Job queue error', error));
	await boss.start();

	for (const queue of queues) {
		await boss.createQueue(queue.name, queue.options);
	}
	const jobQueue = new JobQueue(boss);
	for (const { queue, handle } of createWorkers(jobQueue)) {
		const concurrency = queue.groupBy
			? { localConcurrency: GROUPS_IN_PARALLEL, groupConcurrency: 1 }
			: {};
		// Without burst mode, a worker takes one job per polling interval even with a backlog waiting.
		const options = { burstWhenReadyExceeds: 1, includeMetadata: true, ...concurrency } as const;
		await boss.work<object>(queue.name, options, async (jobs) => {
			for (const job of jobs as JobWithMetadata<object>[]) {
				try {
					await handle(job);
				} catch (error) {
					const until = deferUntil(error);
					if (until) {
						await boss.send(queue.name, job.data, {
							singletonKey: job.singletonKey ?? undefined,
							startAfter: until,
							...(job.groupId ? { group: { id: job.groupId } } : {})
						});
						continue;
					}
					console.error(
						`Job ${queue.name} ${job.id} failed on attempt ${job.retryCount + 1}`,
						error
					);
					throw error;
				}
			}
		});
	}

	return jobQueue;
}
