<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge, Button, Heading, Stack, Text } from '@immich/ui';
	import { onReviewChange } from '$lib/review-changes.svelte';
	import { currentReviewer, reviewableOrgs } from './session.remote';

	const [reviewer, { orgs, installUrl }] = $derived(
		await Promise.all([currentReviewer(), reviewableOrgs()])
	);
	onReviewChange(
		() => true,
		() => reviewableOrgs().refresh()
	);
</script>

{#if !reviewer}
	<Stack gap={4}>
		<Heading size="large">slopbonk</Heading>
		<Text>
			Finds accounts that farm comments across many repositories, and puts them in front of your
			organisation's maintainers for review.
		</Text>
		<div><Button href={resolve('/auth/login')}>Sign in with GitHub</Button></div>
	</Stack>
{:else}
	<Stack gap={4}>
		<Heading size="medium">Organisations</Heading>
		{#each orgs as org (org.id)}
			<a
				href={resolve('/orgs/[org]', { org: org.login })}
				class="flex items-center justify-between rounded-xl border border-light-300 p-4 transition-colors hover:border-primary-500 hover:bg-subtle"
			>
				<span class="flex items-center gap-3">
					<img src="https://github.com/{org.login}.png?size=64" alt="" class="size-8 rounded-lg" />
					<b>{org.login}</b>
				</span>
				{#if org.toReview === 0}
					<Text size="small" color="muted">nothing to review</Text>
				{:else}
					<Badge color="warning">{org.toReview} to review</Badge>
				{/if}
			</a>
		{:else}
			<Text>slopbonk isn't installed on any organisation you belong to.</Text>
		{/each}
		<div><Button href={installUrl} variant="outline">Install on an organisation</Button></div>
	</Stack>
{/if}
