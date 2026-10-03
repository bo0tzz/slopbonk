<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge, Heading, HStack, Stack, Text } from '@immich/ui';
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
	const snippet = (body: string) => (body.length > 140 ? `${body.slice(0, 140)}…` : body);
</script>

<Stack gap={4}>
	<Heading size="medium">{data.org}</Heading>

	<nav class="flex gap-4 border-b border-gray-200 dark:border-gray-800">
		{#each tabs as t (t.id)}
			<a
				href="{resolve('/orgs/[org]', { org: data.org })}?tab={t.id}"
				class="-mb-px border-b-2 px-1 pb-2 {tab === t.id
					? 'border-primary-500 font-semibold'
					: 'border-transparent text-gray-500'}"
			>
				{t.label} ({data.counts[t.id]})
			</a>
		{/each}
	</nav>

	{#each data.entries as entry (entry.caseId)}
		<a
			href={resolve('/orgs/[org]/accounts/[login]', { org: data.org, login: entry.login })}
			class="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
		>
			<Stack gap={2}>
				<HStack class="justify-between">
					<HStack>
						<img
							src="https://github.com/{entry.login}.png?size=48"
							alt=""
							class="size-6 rounded-full"
						/>
						<Text fontWeight="semi-bold">{entry.login}</Text>
						<Badge size="small" color={entry.score >= 4 ? 'danger' : 'warning'}
							>{entry.score}/4</Badge
						>
					</HStack>
					<Text size="small" color="muted">{ago(entry.lastSeen)}</Text>
				</HStack>
				<Text size="small" color="muted">{entry.reasons.join(' · ')}</Text>
				{#if entry.latestComment}
					<Text size="small" class="whitespace-pre-line">{snippet(entry.latestComment.body)}</Text>
				{/if}
			</Stack>
		</a>
	{:else}
		<Text color="muted">
			{tab === 'review' ? 'Nothing to review right now.' : 'None yet.'}
		</Text>
	{/each}
</Stack>
