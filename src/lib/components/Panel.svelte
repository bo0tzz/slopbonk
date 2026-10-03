<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Heading } from '@immich/ui';

	interface Props {
		title?: string;
		/** Folds the panel closed, with this shown beside the title. */
		collapsedNote?: string;
		children: Snippet;
	}

	let { title, collapsedNote, children }: Props = $props();
</script>

{#if collapsedNote !== undefined}
	<details class="group rounded-xl border border-light-300 p-5">
		<summary class="flex cursor-pointer list-none items-center justify-between gap-4">
			<Heading size="tiny" class="text-light-600">{title}</Heading>
			<span class="text-sm text-light-600">
				{collapsedNote}
				<span class="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
			</span>
		</summary>
		<div class="mt-3">{@render children()}</div>
	</details>
{:else}
	<section class="rounded-xl border border-light-300 p-5">
		{#if title}
			<Heading size="tiny" class="mb-3 text-light-600">{title}</Heading>
		{/if}
		{@render children()}
	</section>
{/if}
