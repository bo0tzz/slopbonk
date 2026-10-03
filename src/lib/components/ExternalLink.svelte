<script lang="ts">
	import type { Snippet } from 'svelte';

	let { href, children }: { href: string; children: Snippet } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- always points off-site -->
<a {href} target="_blank" rel="noreferrer" class="hover:underline">{@render children()} ↗</a>
