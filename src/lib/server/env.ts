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
