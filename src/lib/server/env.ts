import { env } from '$env/dynamic/private';

function required(name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

export function databaseUrl(): string {
	return required('DATABASE_URL');
}

/**
 * Public URL of this instance, without trailing slash; GitHub redirects reviewers back to it. The
 * same variable tells adapter-node which origin requests arrive on.
 */
export function baseUrl(): string {
	return required('ORIGIN').replace(/\/$/, '');
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
		appId: Number(required('GITHUB_APP_ID')),
		slug: required('GITHUB_APP_SLUG'),
		clientId: required('GITHUB_CLIENT_ID'),
		clientSecret: required('GITHUB_CLIENT_SECRET'),
		webhookSecret: required('GITHUB_WEBHOOK_SECRET'),
		// .env files hold the PEM on one line with escaped newlines.
		privateKey: required('GITHUB_PRIVATE_KEY').replaceAll('\\n', '\n')
	};
}
