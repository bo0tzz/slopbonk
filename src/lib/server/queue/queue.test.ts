import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';
import { createTestDatabase } from '../testing/database';
import { defineQueue, startQueue, worker, type JobQueue } from '.';

const echo = defineQueue<{ value: string }>('test.echo');
const keyed = defineQueue<{ account: number }>('test.keyed', { policy: 'stately' });
const deferring = defineQueue<{ value: string }>('test.deferring', { retryLimit: 0 });
const failedJobs = defineQueue<object>('test.failed');
const failing = defineQueue<{ value: string }>('test.failing', {
	retryLimit: 0,
	deadLetter: failedJobs.name
});

class NotYet extends Error {
	constructor(readonly until: Date) {
		super('not yet');
	}
}

describe('job queue', () => {
	let url: string;
	let drop: () => Promise<void>;
	const started: JobQueue[] = [];
	const received: string[] = [];
	const attempts: string[] = [];
	let notify: () => void = () => {};

	beforeAll(async () => {
		({ url, drop } = await createTestDatabase());
	});

	afterAll(async () => {
		await Promise.all(started.map((queue) => queue.stop()));
		await drop?.();
	});

	async function start() {
		const queue = await startQueue(
			url,
			[echo, keyed, deferring, failedJobs, failing],
			() => [
				worker(echo, async (job) => {
					received.push(job.data.value);
					notify();
				}),
				worker(failing, async () => {
					throw new Error('broken on purpose');
				}),
				worker(deferring, async (job) => {
					attempts.push(job.id);
					if (attempts.length === 1) {
						throw new NotYet(new Date(Date.now() + 500));
					}
					notify();
				})
			],
			{ deferUntil: (error) => (error instanceof NotYet ? error.until : null) }
		);
		started.push(queue);
		return queue;
	}

	it('processes a job', async () => {
		const queue = await start();
		const processed = new Promise<void>((resolve) => (notify = resolve));
		await queue.send(echo, { value: 'hello' });
		await processed;
		expect(received).toEqual(['hello']);
	});

	it('can be started again against the same database', async () => {
		await expect(start()).resolves.toBeDefined();
	});

	it('keeps one queued job per key in a stately queue', async () => {
		const [queue] = started;
		const first = await queue.send(keyed, { account: 1 }, { singletonKey: '1' });
		const duplicate = await queue.send(keyed, { account: 1 }, { singletonKey: '1' });
		const other = await queue.send(keyed, { account: 2 }, { singletonKey: '2' });
		expect(first).not.toBeNull();
		expect(duplicate).toBeNull();
		expect(other).not.toBeNull();
	});

	it('runs a deferred job again later instead of failing it', async () => {
		const [queue] = started;
		const ranAgain = new Promise<void>((resolve) => (notify = resolve));
		await queue.send(deferring, { value: 'later' });
		await ranAgain;
		expect(attempts).toHaveLength(2);
		expect(attempts[0]).not.toBe(attempts[1]);
	}, 15_000);

	it('updates the options of a queue that already exists', async () => {
		const retried = defineQueue<{ value: string }>('test.deferring', { retryLimit: 4 });
		const queue = await startQueue(url, [retried], () => [], { deferUntil: () => null });
		started.push(queue);
		const boss = new PgBoss(url);
		await boss.start();
		expect((await boss.getQueue('test.deferring'))?.retryLimit).toBe(4);
		await boss.stop({ graceful: true });
	});

	it('keeps a job that ran out of retries in the dead letter queue, with its error', async () => {
		const [queue] = started;
		await queue.send(failing, { value: 'doomed' });
		let dead: Awaited<ReturnType<typeof queue.list>> = [];
		for (let i = 0; i < 50 && dead.length === 0; i++) {
			await new Promise((resolve) => setTimeout(resolve, 200));
			dead = await queue.list(failedJobs);
		}
		expect(dead).toHaveLength(1);
		expect(dead[0]).toMatchObject({ sourceName: 'test.failing', data: { value: 'doomed' } });
		const original = await queue.find(dead[0].sourceName!, dead[0].sourceId!);
		expect(original?.output).toMatchObject({ message: 'broken on purpose' });
	}, 15_000);
});
