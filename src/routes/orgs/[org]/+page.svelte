<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge, Heading, Stack, Text } from '@immich/ui';
	import DecisionButtons from '../DecisionButtons.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { orgQueue } from '../review.remote';

	type Tab = 'review' | 'blocked' | 'dismissed';
	const tabs: { id: Tab; label: string }[] = [
		{ id: 'review', label: 'To review' },
		{ id: 'blocked', label: 'Blocked' },
		{ id: 'dismissed', label: 'Dismissed' }
	];

	const tab = $derived((page.url.searchParams.get('tab') ?? 'review') as Tab);
	const data = $derived(await orgQueue({ org: page.params.org!, tab }));

	const ago = (date: Date) => {
		const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
		if (minutes < 60) return `${minutes}m ago`;
		if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
		return `${Math.round(minutes / 60 / 24)}d ago`;
	};
</script>

<Stack gap={4}>
	<Heading size="medium">{data.org}</Heading>

	<nav class="flex gap-4 border-b border-light-200">
		{#each tabs as t (t.id)}
			<a
				href="{resolve('/orgs/[org]', { org: data.org })}?tab={t.id}"
				class="-mb-px border-b-2 px-1 pb-2 {tab === t.id
					? 'border-primary-500 font-semibold'
					: 'border-transparent text-light-600 hover:text-dark'}"
			>
				{t.label} ({data.counts[t.id]})
			</a>
		{/each}
	</nav>

	{#each data.entries as entry (entry.caseId)}
		<div
			class="relative flex flex-wrap items-center gap-4 rounded-xl border border-light-200 p-4 transition-colors hover:border-primary-500 hover:bg-subtle"
		>
			<div class="flex min-w-48 flex-1 items-center gap-3">
				<img
					src="https://github.com/{entry.login}.png?size=64"
					alt=""
					class="size-8 rounded-full"
				/>
				<div>
					<a
						href={resolve('/orgs/[org]/accounts/[login]', { org: data.org, login: entry.login })}
						class="font-semibold after:absolute after:inset-0"
					>
						{entry.login}
					</a>
					<Text size="small" color="muted">last seen {ago(entry.lastSeen)}</Text>
				</div>
				<Badge color={entry.score >= 4 ? 'danger' : 'warning'}>{entry.score}/4</Badge>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each entry.stats as stat (stat.signal)}
					<StatTile {...stat} />
				{/each}
			</div>
			{#if entry.state === 'open'}
				<div class="relative z-10">
					<DecisionButtons
						org={data.org}
						caseId={entry.caseId}
						login={entry.login}
						canBlock={data.canBlock}
						then="queue"
						size="small"
					/>
				</div>
			{/if}
		</div>
	{:else}
		<Text color="muted">{tab === 'review' ? 'Nothing to review right now.' : 'None yet.'}</Text>
	{/each}
</Stack>
