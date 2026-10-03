import { Webhooks } from '@octokit/webhooks';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { handleWebhookRequest } from './webhook';

const secret = 'test-secret';

const owner = { id: 100, login: 'some-org', type: 'Organization' };
const repository = { id: 200, node_id: 'R_200', name: 'some-repo', owner };
const commenter = { id: 300, node_id: 'U_300', login: 'commenter', type: 'User' };

function discussionComment(overrides: { user?: object; id?: string } = {}) {
	return {
		action: 'created',
		installation: { id: 10 },
		repository,
		discussion: {
			node_id: 'D_1',
			number: 7,
			user: { id: 400 },
			category: { name: 'Q&A', is_answerable: true },
			created_at: '2026-10-01T10:00:00Z'
		},
		comment: {
			node_id: overrides.id ?? 'DC_1',
			user: overrides.user ?? commenter,
			author_association: 'NONE',
			body: 'Have you tried turning it off and on again?',
			created_at: '2026-10-01T11:00:00Z'
		}
	};
}

describe('webhook ingest', () => {
	let db: Db;
	let drop: () => Promise<void>;
	let sent: { queue: string; data: object; key?: string }[];
	const queue = {
		async send(definition: { name: string }, data: object, options?: { singletonKey?: string }) {
			sent.push({ queue: definition.name, data, key: options?.singletonKey });
			return 'job-id';
		}
	};

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	let installationChanges = 0;
	const onInstallationsChanged = () => {
		installationChanges++;
	};

	beforeEach(() => {
		sent = [];
		installationChanges = 0;
	});

	async function deliver(event: string, payload: object, signWith = secret) {
		const body = JSON.stringify(payload);
		const signature = await new Webhooks({ secret: signWith }).sign(body);
		const request = new Request('http://localhost/api/github/webhook', {
			method: 'POST',
			headers: {
				'x-github-delivery': crypto.randomUUID(),
				'x-github-event': event,
				'x-hub-signature-256': signature
			},
			body
		});
		return handleWebhookRequest(request, { db, queue, secret, onInstallationsChanged });
	}

	it('rejects requests without GitHub headers', async () => {
		const response = await handleWebhookRequest(
			new Request('http://localhost', { method: 'POST', body: '{}' }),
			{ db, queue, secret, onInstallationsChanged }
		);
		expect(response.status).toBe(400);
	});

	it('rejects a bad signature without touching anything', async () => {
		const response = await deliver('discussion_comment', discussionComment(), 'wrong-secret');
		expect(response.status).toBe(401);
		expect(await db.selectFrom('comments').selectAll().execute()).toEqual([]);
		expect(sent).toEqual([]);
	});

	it('records an installation and queues its backfill', async () => {
		const response = await deliver('installation', {
			action: 'created',
			installation: { id: 10, account: owner }
		});
		expect(response.status).toBe(202);
		const installation = await db
			.selectFrom('installations')
			.selectAll()
			.where('id', '=', 10)
			.executeTakeFirstOrThrow();
		expect(installation).toMatchObject({
			account_id: 100,
			account_login: 'some-org',
			account_type: 'Organization',
			uninstalled_at: null
		});
		expect(sent).toEqual([{ queue: 'ingest.backfill', data: { installationId: 10 }, key: '10' }]);
		expect(installationChanges).toBe(1);
	});

	it('stores a discussion comment and queues an evaluation', async () => {
		expect((await deliver('discussion_comment', discussionComment())).status).toBe(202);

		const comment = await db
			.selectFrom('comments')
			.innerJoin('threads', 'threads.id', 'comments.thread_id')
			.select([
				'comments.author_id',
				'threads.kind',
				'threads.category_answerable',
				'comments.author_association',
				'comments.source'
			])
			.where('comments.id', '=', 'DC_1')
			.executeTakeFirstOrThrow();
		expect(comment).toEqual({
			author_id: 300,
			kind: 'discussion',
			category_answerable: true,
			author_association: 'NONE',
			source: 'webhook'
		});
		expect(sent).toEqual([
			{ queue: 'policy.evaluate', data: { installationId: 10, userId: 300 }, key: '10:300' }
		]);
	});

	it('ignores a redelivered comment but still queues the evaluation', async () => {
		await deliver('discussion_comment', discussionComment());
		const comments = await db.selectFrom('comments').select('id').execute();
		expect(comments).toEqual([{ id: 'DC_1' }]);
		expect(sent).toHaveLength(1);
	});

	it('marks pull request comments as such', async () => {
		await deliver('issue_comment', {
			action: 'created',
			installation: { id: 10 },
			repository,
			issue: {
				node_id: 'PR_5',
				number: 5,
				user: { id: 400 },
				pull_request: { url: 'https://api.github.com/repos/some-org/some-repo/pulls/5' },
				created_at: '2026-10-01T09:00:00Z'
			},
			comment: {
				node_id: 'IC_1',
				user: commenter,
				author_association: 'NONE',
				body: 'LGTM',
				created_at: '2026-10-01T12:00:00Z'
			}
		});
		const thread = await db
			.selectFrom('threads')
			.select(['kind', 'category_answerable'])
			.where('id', '=', 'PR_5')
			.executeTakeFirstOrThrow();
		expect(thread).toEqual({ kind: 'pull_request', category_answerable: false });
	});

	it('skips comments from bots', async () => {
		await deliver(
			'discussion_comment',
			discussionComment({ id: 'DC_BOT', user: { id: 500, login: 'bot[bot]', type: 'Bot' } })
		);
		const comment = await db
			.selectFrom('comments')
			.select('id')
			.where('id', '=', 'DC_BOT')
			.executeTakeFirst();
		expect(comment).toBeUndefined();
		expect(sent).toEqual([]);
	});

	it('backfills repositories added to an installation', async () => {
		const response = await deliver('installation_repositories', {
			action: 'added',
			installation: { id: 10, account: owner },
			repository_selection: 'selected',
			repositories_added: [{ id: 201, node_id: 'R_201', name: 'new', full_name: 'some-org/new' }],
			repositories_removed: []
		});
		expect(response.status).toBe(202);
		expect(sent).toEqual([
			{
				queue: 'ingest.backfill',
				data: { installationId: 10, repositoryIds: [201] },
				key: '10:201'
			}
		]);
	});

	it('follows an organisation renaming itself', async () => {
		await deliver('installation_target', {
			action: 'renamed',
			installation: { id: 10 },
			account: { id: 100, login: 'renamed-org' },
			changes: { login: { from: 'some-org' } },
			target_type: 'Organization'
		});
		const installation = await db
			.selectFrom('installations')
			.select('account_login')
			.where('id', '=', 10)
			.executeTakeFirstOrThrow();
		const repository = await db
			.selectFrom('repositories')
			.select('owner_login')
			.where('id', '=', 200)
			.executeTakeFirstOrThrow();
		expect([installation.account_login, repository.owner_login]).toEqual([
			'renamed-org',
			'renamed-org'
		]);
	});

	it('keeps the earlier text of an edited comment, once per edit', async () => {
		const edited = {
			...discussionComment({ id: 'DC_EDIT' }),
			action: 'edited',
			changes: { body: { from: 'Have you tried turning it off and on again?' } }
		};
		edited.comment = {
			...edited.comment,
			body: 'Have you tried https://spam.example?',
			updated_at: '2026-10-01T12:00:00Z'
		} as typeof edited.comment;
		await deliver('discussion_comment', edited);
		await deliver('discussion_comment', edited);

		const comment = await db
			.selectFrom('comments')
			.select(['body', 'edited_at'])
			.where('id', '=', 'DC_EDIT')
			.executeTakeFirstOrThrow();
		expect(comment).toEqual({
			body: 'Have you tried https://spam.example?',
			edited_at: new Date('2026-10-01T12:00:00Z')
		});
		const edits = await db
			.selectFrom('comment_edits')
			.select(['body', 'edited_at'])
			.where('comment_id', '=', 'DC_EDIT')
			.execute();
		expect(edits).toEqual([
			{
				body: 'Have you tried turning it off and on again?',
				edited_at: new Date('2026-10-01T12:00:00Z')
			}
		]);
	});

	it('marks an installation as uninstalled', async () => {
		await deliver('installation', { action: 'deleted', installation: { id: 10, account: owner } });
		const { uninstalled_at } = await db
			.selectFrom('installations')
			.select('uninstalled_at')
			.where('id', '=', 10)
			.executeTakeFirstOrThrow();
		expect(uninstalled_at).toBeInstanceOf(Date);
	});
});
