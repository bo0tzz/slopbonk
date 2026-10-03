import type { App } from '@octokit/app';
import { githubApp } from '../env';
import { createApp, installationClient, type GithubClient } from './client';

let app: App | undefined;

export function startGithubApp(): void {
	app ??= createApp(githubApp());
}

export function clientFor(installationId: number): Promise<GithubClient> {
	if (!app) {
		throw new Error('GitHub App has not been started');
	}
	return installationClient(app, installationId);
}
