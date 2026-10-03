import { Webhooks, type EmitterWebhookEvent } from '@octokit/webhooks';
import type { Db } from '../db';
import type { JobSender } from '../queue';
import { backfillQueue, evaluateQueue, githubBlockChangeQueue, jobKey } from '../jobs';
import { storeComment, storeRepository, storeThread, storeUser } from './store';

interface Deps {
	db: Db;
	queue: JobSender;
	secret: string;
}

type CommentEvent = EmitterWebhookEvent<'discussion_comment.created' | 'issue_comment.created'>;

export async function handleWebhookRequest(request: Request, deps: Deps): Promise<Response> {
	const id = request.headers.get('x-github-delivery');
	const name = request.headers.get('x-github-event');
	const signature = request.headers.get('x-hub-signature-256');
	if (!id || !name || !signature) {
		return new Response('Missing GitHub webhook headers', { status: 400 });
	}

	const body = await request.text();
	const webhooks = new Webhooks({ secret: deps.secret });
	if (!(await webhooks.verify(body, signature))) {
		return new Response('Invalid signature', { status: 401 });
	}

	webhooks.on('installation.created', async (event) => {
		await recordInstallation(deps.db, event.payload.installation);
		const job = { installationId: event.payload.installation.id };
		await deps.queue.send(backfillQueue, job, { singletonKey: String(job.installationId) });
	});
	webhooks.on('installation_repositories.added', async (event) => {
		const repositoryIds = event.payload.repositories_added.map((repository) => repository.id);
		const job = { installationId: event.payload.installation.id, repositoryIds };
		await deps.queue.send(backfillQueue, job, {
			singletonKey: `${job.installationId}:${repositoryIds.join(',')}`
		});
	});
	webhooks.on('installation.unsuspend', (event) =>
		recordInstallation(deps.db, event.payload.installation)
	);
	webhooks.on(['installation.deleted', 'installation.suspend'], (event) =>
		markUninstalled(deps.db, event.payload.installation.id)
	);
	webhooks.on(['org_block.blocked', 'org_block.unblocked'], async (event) => {
		const { installation, blocked_user: user, sender } = event.payload;
		// slopbonk's own blocks come back from the app's bot account.
		if (!installation || !user || sender.type !== 'User') {
			return;
		}
		await deps.queue.send(githubBlockChangeQueue, {
			installationId: installation.id,
			userId: user.id,
			action: event.payload.action === 'blocked' ? 'block' : 'unblock',
			actor: { id: sender.id, login: sender.login }
		});
	});
	webhooks.on('installation_target.renamed', (event) =>
		recordRename(deps.db, event.payload.installation.id, event.payload.account)
	);
	webhooks.on(['discussion_comment.created', 'issue_comment.created'], (event) =>
		recordComment(deps, event)
	);
	await webhooks.receive({ id, name, payload: JSON.parse(body) } as EmitterWebhookEvent);

	return new Response(null, { status: 202 });
}

interface InstallationPayload {
	id: number;
	account: { id: number; login?: string; slug?: string; type?: string } | null;
}

async function recordInstallation(db: Db, installation: InstallationPayload) {
	const account = installation.account;
	const accountType = account?.type;
	if (!account || (accountType !== 'Organization' && accountType !== 'User')) {
		return;
	}
	const values = {
		account_id: account.id,
		account_login: account.login ?? account.slug ?? String(account.id),
		account_type: accountType,
		uninstalled_at: null
	} as const;
	await db
		.insertInto('installations')
		.values({ id: installation.id, ...values })
		.onConflict((oc) => oc.column('id').doUpdateSet(values))
		.execute();
}

async function recordRename(
	db: Db,
	installationId: number,
	account: { id: number; login?: string; slug?: string }
) {
	const login = account.login ?? account.slug;
	if (!login) {
		return;
	}
	await db
		.updateTable('installations')
		.set({ account_login: login })
		.where('id', '=', installationId)
		.execute();
	await db
		.updateTable('repositories')
		.set({ owner_login: login })
		.where('owner_id', '=', account.id)
		.execute();
}

async function markUninstalled(db: Db, installationId: number) {
	await db
		.updateTable('installations')
		.set({ uninstalled_at: new Date() })
		.where('id', '=', installationId)
		.execute();
}

async function recordComment({ db, queue }: Deps, event: CommentEvent) {
	const { payload } = event;
	const { comment, repository } = payload;
	const installationId = payload.installation?.id;
	if (!installationId || !comment.user || comment.user.type !== 'User') {
		return;
	}

	const owner = repository.owner;
	await recordInstallation(db, {
		id: installationId,
		account: { id: owner.id, login: owner.login, type: owner.type }
	});

	const author = comment.user;
	await storeUser(db, { id: author.id, node_id: author.node_id, login: author.login });

	await storeRepository(db, {
		id: repository.id,
		node_id: repository.node_id,
		owner_id: owner.id,
		owner_login: owner.login,
		name: repository.name
	});

	const thread =
		event.name === 'discussion_comment'
			? {
					id: event.payload.discussion.node_id,
					kind: 'discussion' as const,
					number: event.payload.discussion.number,
					author_id: event.payload.discussion.user?.id ?? null,
					category_name: event.payload.discussion.category.name,
					category_answerable: event.payload.discussion.category.is_answerable,
					created_at: event.payload.discussion.created_at
				}
			: {
					id: event.payload.issue.node_id,
					kind: event.payload.issue.pull_request ? ('pull_request' as const) : ('issue' as const),
					number: event.payload.issue.number,
					author_id: event.payload.issue.user?.id ?? null,
					category_name: null,
					category_answerable: false,
					created_at: event.payload.issue.created_at
				};
	await storeThread(db, { ...thread, repository_id: repository.id });

	await storeComment(db, {
		id: comment.node_id,
		author_id: author.id,
		thread_id: thread.id,
		author_association: comment.author_association,
		is_answer: false,
		body: comment.body,
		created_at: comment.created_at,
		edited_at: null,
		source: 'webhook'
	});

	const job = { installationId, userId: author.id };
	await queue.send(evaluateQueue, job, { singletonKey: jobKey(job) });
}
