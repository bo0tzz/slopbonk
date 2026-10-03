<script lang="ts">
	let { value, label, fired }: { value: string; label: string; fired: boolean } = $props();
</script>

<div
	class="min-w-24 rounded-lg border px-3 py-2 {fired
		? 'border-primary-500 bg-primary-500/10'
		: 'border-light-200'}"
>
	<div class="text-lg font-semibold tabular-nums {fired ? '' : 'text-light-600'}">{value}</div>
	<div class="text-xs text-light-600">{label}</div>
</div>
