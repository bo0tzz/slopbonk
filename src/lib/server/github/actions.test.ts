import { Octokit } from '@octokit/core';
import { describe, expect, it } from 'vitest';
import { minimizeComment } from './actions';

/** An Octokit whose GraphQL calls get these responses, in order. */
function octokitAnswering(...responses: object[]) {
	const queries: string[] = [];
	const fetch = async (_url: string, init: { body: string }) => {
		queries.push(JSON.parse(init.body).query);
		return new Response(JSON.stringify(responses.shift()), {
			headers: { 'content-type': 'application/json' }
		});
	};
	return { octokit: new Octokit({ request: { fetch } }), queries };
}

const couldNotMinimize = {
	data: { minimizeComment: null },
	errors: [{ message: 'Could not minimize comment.', path: ['minimizeComment'] }]
};

describe('minimizeComment', () => {
	it('hides the comment', async () => {
		const { octokit } = octokitAnswering({
			data: { minimizeComment: { minimizedComment: { isMinimized: true } } }
		});
		expect(await minimizeComment(octokit, 'DC_1')).toBe(true);
	});

	it('counts a comment someone already hid as hidden', async () => {
		const { octokit, queries } = octokitAnswering(couldNotMinimize, {
			data: { node: { isMinimized: true } }
		});
		expect(await minimizeComment(octokit, 'DC_1')).toBe(true);
		expect(queries).toHaveLength(2);
	});

	it('still fails when the comment is not hidden', async () => {
		const { octokit } = octokitAnswering(couldNotMinimize, {
			data: { node: { isMinimized: false } }
		});
		await expect(minimizeComment(octokit, 'DC_1')).rejects.toThrow('Could not minimize comment');
	});

	it('reports a comment that no longer exists', async () => {
		const { octokit } = octokitAnswering({
			data: { minimizeComment: null },
			errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a node' }]
		});
		expect(await minimizeComment(octokit, 'DC_gone')).toBe(false);
	});
});
