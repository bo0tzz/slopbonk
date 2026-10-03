import { getRequestEvent, query } from '$app/server';
import { githubApp } from '$lib/server/env';
import { reviewableInstallations } from '$lib/server/review/installations';
import { getServices } from '$lib/server/services';

export const currentReviewer = query(async () => {
	const { reviewer } = getRequestEvent().locals;
	return reviewer ? { login: reviewer.login } : null;
});

export const reviewableOrgs = query(async () => {
	const { reviewer } = getRequestEvent().locals;
	return {
		installUrl: `https://github.com/apps/${githubApp().slug}/installations/new`,
		orgs: reviewer ? await reviewableInstallations(getServices().db, reviewer.installationIds) : []
	};
});
