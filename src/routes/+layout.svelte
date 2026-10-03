<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { env } from '$env/dynamic/public';
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
	<div class="flex min-h-dvh flex-col">
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
						{#if reviewer.operator}
							<a href={resolve('/admin')} class="text-sm text-primary hover:underline">Admin</a>
						{/if}
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

		<main class="mx-auto w-full max-w-5xl flex-1 p-6">
			{@render children()}
		</main>

		{#if env.PUBLIC_CONTACT_EMAIL}
			<footer class="border-t border-light-300 py-4">
				<Text size="small" color="muted" class="mx-auto max-w-5xl px-6">
					To ask about or remove data about your GitHub account, email
					<a href="mailto:{env.PUBLIC_CONTACT_EMAIL}" class="underline"
						>{env.PUBLIC_CONTACT_EMAIL}</a
					>.
				</Text>
			</footer>
		{/if}
	</div>
</TooltipProvider>
