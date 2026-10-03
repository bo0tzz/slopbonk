<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Heading } from '@immich/ui';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="rounded-xl border border-light-200 p-5">
	<Heading size="tiny" class="mb-3 text-light-600 uppercase">{title}</Heading>
	{@render children()}
</section>
