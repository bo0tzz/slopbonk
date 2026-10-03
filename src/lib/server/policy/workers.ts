import type { Db } from '../db';
import { evaluateQueue } from '../jobs';
import { worker, type JobSender } from '../queue';
import { evaluate } from './evaluate';

interface Deps {
	db: Db;
	queue: JobSender;
}

export function evaluateWorker({ db, queue }: Deps) {
	return worker(evaluateQueue, async ({ data }) => {
		await evaluate(db, queue, data);
	});
}
