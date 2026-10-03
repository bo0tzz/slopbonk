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
</script>

<figure class="w-full">
	<svg
		viewBox="0 0 {width} {height + 14}"
		class="h-28 w-full max-w-xl"
		role="img"
		aria-label="Comments per day across GitHub over the last {days.length} days"
	>
		<line x1="0" x2={width} y1={height} y2={height} class="stroke-gray-200 dark:stroke-gray-700" />
		{#each days as d, i (d.day)}
			<g>
				<title>{label(d.day)}: {d.comments} comment{d.comments === 1 ? '' : 's'}</title>
				<rect
					x={i * (columnWidth + gap)}
					y="0"
					width={columnWidth + gap}
					{height}
					fill="transparent"
				/>
				{#if d.comments > 0}
					<path d={column(i, d.comments)} class="fill-primary" />
				{/if}
			</g>
		{/each}
		{#if days[peak]?.comments > 0}
			<text
				x={peak * (columnWidth + gap) + columnWidth / 2}
				y={height - (days[peak].comments / max) * (height - 16) - 4}
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
	<table class="sr-only">
		<caption>Comments per day</caption>
		<tbody>
			{#each days as d (d.day)}
				<tr><th scope="row">{d.day}</th><td>{d.comments}</td></tr>
			{/each}
		</tbody>
	</table>
</figure>
