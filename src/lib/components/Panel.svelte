<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Heading } from '@immich/ui';

	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section class="rounded-xl border border-light-300 p-5">
	{#if title}
		<Heading size="tiny" class="mb-3 text-light-600">{title}</Heading>
	{/if}
	{@render children()}
</section>
