import type { Db } from '../db';
import { evaluateQueue } from '../jobs';
import { worker, type JobQueue } from '../queue';
import { evaluate } from './evaluate';

interface Deps {
	db: Db;
	queue: Pick<JobQueue, 'send'>;
}

export function evaluateWorker({ db, queue }: Deps) {
	return worker(evaluateQueue, async ({ data }) => {
		await evaluate(db, queue, data);
	});
}
