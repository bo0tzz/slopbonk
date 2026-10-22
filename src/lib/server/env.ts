import {
	GITHUB_APP_ID,
	GITHUB_APP_SLUG,
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET,
	GITHUB_PRIVATE_KEY,
	GITHUB_WEBHOOK_SECRET,
	OPERATOR_GITHUB_IDS,
	ORIGIN
} from '$app/env/private';

/** Public URL of this instance, without trailing slash; GitHub redirects reviewers back to it. */
export function baseUrl(): string {
	return ORIGIN.replace(/\/$/, '');
}

/** GitHub user ids of the people who run this instance; they can open the admin panel. */
export function operatorIds(): number[] {
	return OPERATOR_GITHUB_IDS.split(',')
		.map((id) => Number(id.trim()))
		.filter((id) => Number.isInteger(id) && id > 0);
}

export interface GithubAppConfig {
	appId: number;
	slug: string;
	clientId: string;
	clientSecret: string;
	webhookSecret: string;
	privateKey: string;
}

export function githubApp(): GithubAppConfig {
	return {
		appId: Number(GITHUB_APP_ID),
		slug: GITHUB_APP_SLUG,
		clientId: GITHUB_CLIENT_ID,
		clientSecret: GITHUB_CLIENT_SECRET,
		webhookSecret: GITHUB_WEBHOOK_SECRET,
		// .env files hold the PEM on one line with escaped newlines.
		privateKey: GITHUB_PRIVATE_KEY.replaceAll('\\n', '\n')
	};
}
