<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { Button, HStack, Heading, Text } from '@immich/ui';
	import { currentReviewer } from './session.remote';

	let { children } = $props();
	const reviewer = $derived(await currentReviewer());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>slopbonk</title>
</svelte:head>

<header class="border-b border-gray-200 px-6 py-3 dark:border-gray-800">
	<HStack class="justify-between">
		<a href={resolve('/')}><Heading size="small">slopbonk</Heading></a>
		{#if reviewer}
			<HStack>
				<Text size="small">{reviewer.login}</Text>
				<form method="POST" action={resolve('/auth/logout')}>
					<Button type="submit" size="small" variant="ghost">Sign out</Button>
				</form>
			</HStack>
		{/if}
	</HStack>
</header>

<main class="mx-auto max-w-5xl p-6">
	{@render children()}
</main>
