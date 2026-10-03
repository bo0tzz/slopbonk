import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../testing/database';
import { defineQueue, startQueue, worker, type JobQueue } from '.';

const echo = defineQueue<{ value: string }>('test.echo');
const keyed = defineQueue<{ account: number }>('test.keyed', { policy: 'stately' });

describe('job queue', () => {
	let url: string;
	let drop: () => Promise<void>;
	const started: JobQueue[] = [];
	const received: string[] = [];
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
			[echo, keyed],
			[
				worker(echo, async (job) => {
					received.push(job.data.value);
					notify();
				})
			]
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
});
