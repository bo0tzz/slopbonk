<script lang="ts">
	interface Props {
		days: { day: string; comments: number }[];
	}

	let { days }: Props = $props();

	const height = 80;
	const columnWidth = 12;
	const gap = 2;
	const radius = 4;
	const width = $derived(days.length * (columnWidth + gap) - gap);
	const max = $derived(Math.max(1, ...days.map((d) => d.comments)));
	const peak = $derived(
		days.reduce((best, d, i) => (d.comments > days[best].comments ? i : best), 0)
	);
	let hovered = $state<number | null>(null);

	const top = (value: number) => height - (value / max) * (height - 16);

	/** A column with a rounded data-end and a square baseline. */
	function column(i: number, value: number): string {
		const h = Math.max((value / max) * (height - 16), value > 0 ? 2 : 0);
		const x = i * (columnWidth + gap);
		const y = height - h;
		const r = Math.min(radius, h / 2, columnWidth / 2);
		return `M${x},${height} V${y + r} Q${x},${y} ${x + r},${y} H${x + columnWidth - r} Q${x + columnWidth},${y} ${x + columnWidth},${y + r} V${height} Z`;
	}

	const label = (day: string) =>
		new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

	/** Keeps the tooltip inside the chart at either end. */
	function anchor(i: number) {
		if (i < 3) {
			return '0%';
		}
		return i > days.length - 4 ? '-100%' : '-50%';
	}
</script>

<figure class="relative w-full max-w-xl">
	<svg
		viewBox="0 0 {width} {height + 14}"
		class="h-auto w-full"
		role="img"
		aria-label="Comments per day across GitHub over the last {days.length} days"
		onpointerleave={(e) => e.pointerType === 'mouse' && (hovered = null)}
	>
		<line x1="0" x2={width} y1={height} y2={height} class="stroke-gray-200 dark:stroke-gray-700" />
		{#each days as d, i (d.day)}
			<rect
				role="presentation"
				x={i * (columnWidth + gap) - gap / 2}
				y="0"
				width={columnWidth + gap}
				{height}
				rx="3"
				class={hovered === i ? 'fill-light-100' : 'fill-transparent'}
				onpointerenter={() => (hovered = i)}
				onpointerdown={() => (hovered = i)}
			/>
			{#if d.comments > 0}
				<path d={column(i, d.comments)} class="pointer-events-none fill-primary" />
			{/if}
		{/each}
		{#if days[peak]?.comments > 0 && hovered === null}
			<text
				x={peak * (columnWidth + gap) + columnWidth / 2}
				y={top(days[peak].comments) - 4}
				text-anchor="middle"
				class="fill-gray-600 text-[9px] dark:fill-gray-300"
			>
				{days[peak].comments}
			</text>
		{/if}
		<text x="0" y={height + 12} class="fill-gray-500 text-[9px]">{label(days[0]?.day ?? '')}</text>
		<text x={width} y={height + 12} text-anchor="end" class="fill-gray-500 text-[9px]">
			{label(days[days.length - 1]?.day ?? '')}
		</text>
	</svg>
	{#if hovered !== null && days[hovered]}
		{@const d = days[hovered]}
		<div
			class="pointer-events-none absolute z-10 rounded-md border border-light-300 bg-light px-2 py-1 text-xs whitespace-nowrap shadow-sm"
			style:left="{((hovered * (columnWidth + gap) + columnWidth / 2) / width) * 100}%"
			style:top="{(top(d.comments) / (height + 14)) * 100}%"
			style:transform="translate({anchor(hovered)}, calc(-100% - 6px))"
		>
			<span class="font-semibold tabular-nums">{d.comments}</span>
			comment{d.comments === 1 ? '' : 's'}
			<span class="text-light-600">· {label(d.day)}</span>
		</div>
	{/if}
	<table class="sr-only">
		<tbody>
			{#each days as d (d.day)}
				<tr><th scope="row">{d.day}</th><td>{d.comments}</td></tr>
			{/each}
		</tbody>
	</table>
</figure>
