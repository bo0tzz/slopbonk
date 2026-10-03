import type { Db } from '../db';
import { githubBlockChangeQueue } from '../jobs';
import { worker } from '../queue';
import { recordGithubBlockChange } from './decisions';

export function githubBlockChangeWorker({ db }: { db: Db }) {
	return worker(githubBlockChangeQueue, async ({ data }) => {
		await recordGithubBlockChange(db, data);
	});
}
