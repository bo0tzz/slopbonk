import { generateKeyPairSync } from 'node:crypto';
import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import { describe, expect, it } from 'vitest';
import { installationClient } from './reads';

const { privateKey } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const json = (status: number, body: object) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An app whose GitHub answers the token request and `GET /user/42` as given. */
function appWhere(token: Response, user: Response) {
	const fetch = async (url: string) =>
		url.endsWith('/access_tokens') ? token.clone() : user.clone();
	return new App({ appId: 1, privateKey, Octokit: Octokit.defaults({ request: { fetch } }) });
}

const issued = () =>
	json(201, {
		token: 'ghs_test',
		expires_at: new Date(Date.now() + 3_600_000).toISOString(),
		permissions: {},
		repository_selection: 'all'
	});
const notFound = (message: string) => json(404, { message });

describe('installationClient', () => {
	it('reads a 404 for the user as the account being gone', async () => {
		const client = await installationClient(appWhere(issued(), notFound('Not Found')), 7);
		expect(await client.getUser(42)).toBeNull();
	});

	it('fails for a removed installation rather than reporting the user gone', async () => {
		const app = appWhere(notFound('Integration not found'), notFound('Not Found'));
		await expect(installationClient(app, 7)).rejects.toMatchObject({ status: 404 });
	});
});
