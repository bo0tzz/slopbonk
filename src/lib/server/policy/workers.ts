import type { Db } from '../db';
import { evaluateQueue, refreshCasesQueue } from '../jobs';
import { worker, type JobSender } from '../queue';
import { evaluate } from './evaluate';
import { refreshCases } from './refresh';

interface Deps {
	db: Db;
	queue: JobSender;
}

export function evaluateWorker({ db, queue }: Deps) {
	return worker(evaluateQueue, async ({ data }) => {
		await evaluate(db, queue, data);
	});
}

export function refreshCasesWorker({ db, queue }: Deps) {
	return worker(refreshCasesQueue, async () => {
		await refreshCases(db, queue);
	});
}
