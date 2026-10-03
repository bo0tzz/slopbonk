import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

// Architecture boundaries (ADR-0002): infrastructure doesn't depend on components or the
// composition root, and the components (ingest, policy, act, review) only talk to each other
// through jobs.ts.
const server = 'src/lib/server';
const components = ['ingest', 'policy', 'act', 'review'];
const forbid = (files, targets, message) => ({
	files,
	rules: {
		'no-restricted-imports': [
			'error',
			{ patterns: [{ regex: `(^|/)(${targets.join('|')})(/|$)`, message }] }
		]
	}
});
const boundaries = [
	forbid(
		[`${server}/{db,queue,github,testing}/**`, `${server}/{env,constants,jobs}.ts`],
		[...components, 'services'],
		'Infrastructure must not depend on ingest, policy, act or the composition root.'
	),
	...components.map((component) =>
		forbid(
			[`${server}/${component}/**`],
			[...components.filter((other) => other !== component), 'services'],
			`${component} may only reach other components through jobs.ts.`
		)
	)
];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	...boundaries,
	{
		files: ['src/lib/server/db/migrations/**'],
		rules: {
			// sql-tools generates migrations typed against Kysely<any>.
			'@typescript-eslint/no-explicit-any': 'off'
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
