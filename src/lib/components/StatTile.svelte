<script lang="ts">
	let { value, label, fired }: { value: string; label: string; fired: boolean } = $props();
</script>

<div class="px-3 first:pl-0">
	<div
		class="text-lg leading-tight tabular-nums {fired ? 'font-bold text-primary' : 'text-light-600'}"
	>
		{value}
	</div>
	<div class="text-xs text-light-600">{label}</div>
</div>
