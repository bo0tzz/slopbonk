<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, Card, CardBody, Heading, Stack, Text } from '@immich/ui';
	import { currentReviewer, reviewableOrgs } from './session.remote';

	const [reviewer, { orgs, installUrl }] = $derived(
		await Promise.all([currentReviewer(), reviewableOrgs()])
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
			<Card>
				<CardBody>
					<Text>
						<b>{org.login}</b>
						· {org.toReview === 0 ? 'nothing to review' : `${org.toReview} to review`}
					</Text>
				</CardBody>
			</Card>
		{:else}
			<Text>slopbonk isn't installed on any organisation you belong to.</Text>
		{/each}
		<div><Button href={installUrl} variant="outline">Install on an organisation</Button></div>
	</Stack>
{/if}
