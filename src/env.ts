import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';
import * as v from 'valibot';

/** The image is built without the deployment's variables, so they are only checked at startup. */
const required = building ? v.optional(v.string(), '') : v.pipe(v.string(), v.nonEmpty());
const optional = v.optional(v.string(), '');

export const variables = defineEnvVars({
	DATABASE_URL: { schema: required },
	ORIGIN: { schema: required },
	GITHUB_APP_ID: { schema: required },
	GITHUB_APP_SLUG: { schema: required },
	GITHUB_CLIENT_ID: { schema: required },
	GITHUB_CLIENT_SECRET: { schema: required },
	GITHUB_WEBHOOK_SECRET: { schema: required },
	GITHUB_PRIVATE_KEY: { schema: required },
	OPERATOR_GITHUB_IDS: { schema: optional },
	PUBLIC_CONTACT_EMAIL: { public: true, schema: optional },
	DEV_REVIEWER_SECRET: { schema: optional },
	DEV_REVIEWER_ID: { schema: optional }
});
