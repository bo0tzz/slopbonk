import { PgBoss, type Job, type Queue, type SendOptions } from 'pg-boss';

export type QueueOptions = Omit<Queue, 'name'>;

export interface QueueDefinition<T extends object> {
	name: string;
	options: QueueOptions;
	/** Never set; carries the payload type. */
	readonly payload?: T;
}

export function defineQueue<T extends object>(
	name: string,
	options: QueueOptions = {}
): QueueDefinition<T> {
	return { name, options };
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

export class JobQueue {
	constructor(private readonly boss: PgBoss) {}

	/** Returns the job id, or null when the queue's policy dropped the job as a duplicate. */
	send<T extends object>(
		queue: QueueDefinition<T>,
		data: T,
		options?: SendOptions
	): Promise<string | null> {
		return this.boss.send(queue.name, data, options);
	}

	stop(): Promise<void> {
		return this.boss.stop({ graceful: true });
	}
}

/** What components need to hand work to each other. */
export type JobSender = Pick<JobQueue, 'send'>;

export async function startQueue(
	connectionString: string,
	queues: QueueDefinition<object>[],
	createWorkers: (queue: JobQueue) => Worker<object>[]
): Promise<JobQueue> {
	const boss = new PgBoss(connectionString);
	boss.on('error', (error) => console.error('Job queue error', error));
	await boss.start();

	for (const queue of queues) {
		await boss.createQueue(queue.name, queue.options);
	}
	const jobQueue = new JobQueue(boss);
	for (const { queue, handle } of createWorkers(jobQueue)) {
		await boss.work<object>(queue.name, async (jobs) => {
			for (const job of jobs) {
				await handle(job);
			}
		});
	}

	return jobQueue;
}
