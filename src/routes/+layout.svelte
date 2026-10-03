<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { mdiGithub } from '@mdi/js';
	import {
		Button,
		HStack,
		Heading,
		IconButton,
		Text,
		ThemeSwitcher,
		TooltipProvider
	} from '@immich/ui';
	import { currentReviewer } from './session.remote';

	let { children } = $props();
	const reviewer = $derived(await currentReviewer());
</script>

<svelte:head>
	<link rel="icon" href="/logo.png" />
	<title>slopbonk</title>
</svelte:head>

<TooltipProvider>
	<header class="border-b border-light-300 px-6 py-3">
		<HStack class="justify-between">
			<a href={resolve('/')}>
				<HStack>
					<img src="/logo.png" alt="" class="size-8" />
					<Heading size="small">slopbonk</Heading>
				</HStack>
			</a>
			<HStack>
				{#if reviewer}
					<Text size="small">{reviewer.login}</Text>
					<form method="POST" action={resolve('/auth/logout')}>
						<Button type="submit" size="small" variant="ghost">Sign out</Button>
					</form>
				{/if}
				<IconButton
					icon={mdiGithub}
					href="https://github.com/bo0tzz/slopbonk"
					target="_blank"
					rel="noreferrer"
					aria-label="Source code on GitHub"
					size="small"
					variant="ghost"
					shape="round"
				/>
				<ThemeSwitcher size="small" />
			</HStack>
		</HStack>
	</header>

	<main class="mx-auto max-w-5xl p-6">
		{@render children()}
	</main>
</TooltipProvider>
