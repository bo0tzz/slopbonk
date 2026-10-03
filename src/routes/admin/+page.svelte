<script lang="ts">
	import { Heading, Stack, Text } from '@immich/ui';
	import Panel from '$lib/components/Panel.svelte';
	import { onReviewChange } from '$lib/review-changes.svelte';
	import { adminOverview } from './admin.remote';

	const data = $derived(await adminOverview());
	onReviewChange(
		() => true,
		() => adminOverview().refresh()
	);

	const when = (date: Date) =>
		date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Admin · slopbonk</title></svelte:head>

<Stack gap={6}>
	<Heading size="medium">Admin</Heading>

	<Panel title="Queues">
		<table class="w-full text-sm">
			<thead class="text-left text-light-600">
				<tr>
					<th class="py-1 font-normal">Queue</th>
					<th class="py-1 text-right font-normal">Ready</th>
					<th class="py-1 text-right font-normal">Scheduled</th>
					<th class="py-1 text-right font-normal">Running</th>
					<th class="py-1 text-right font-normal">Failed</th>
				</tr>
			</thead>
			<tbody class="tabular-nums">
				{#each data.queues as queue (queue.name)}
					<tr class="border-t border-light-300">
						<td class="py-1">{queue.name}</td>
						<td class="py-1 text-right">{queue.ready}</td>
						<td class="py-1 text-right">{queue.deferred}</td>
						<td class="py-1 text-right">{queue.active}</td>
						<td class="py-1 text-right {queue.failed ? 'font-semibold text-danger' : ''}">
							{queue.failed}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Panel>

	<Panel title="Rate limits">
		{#each data.rateLimits as hold (hold.installation)}
			<Text size="small">{hold.installation}: waiting until {when(hold.until)}</Text>
		{:else}
			<Text size="small" color="muted">No installation is rate limited.</Text>
		{/each}
	</Panel>

	<Panel title="Failed jobs">
		<Stack gap={3}>
			{#each data.failedJobs as job, i (i)}
				<div class="min-w-0">
					<Text size="small">
						<b>{job.queue}</b> <span class="text-light-600">· {when(job.failedAt)}</span>
					</Text>
					<Text size="small" class="break-words text-danger">{job.error}</Text>
					<Text size="small" color="muted" class="truncate">{JSON.stringify(job.data)}</Text>
				</div>
			{:else}
				<Text size="small" color="muted">No jobs failed in the last two weeks.</Text>
			{/each}
		</Stack>
	</Panel>

	<Panel title="Failed GitHub actions">
		<Stack gap={3}>
			{#each data.failedActions as action, i (i)}
				<div>
					<Text size="small">
						<b>{action.action === 'block_user' ? 'Block' : 'Hide comment of'} {action.target}</b>
						in {action.installation}
						<span class="text-light-600">
							· {action.attempts} attempt{action.attempts === 1 ? '' : 's'}{#if action.failedAt}, {when(
									action.failedAt
								)}{/if}
						</span>
					</Text>
					<Text size="small" class="break-words text-danger">{action.error}</Text>
				</div>
			{:else}
				<Text size="small" color="muted">None.</Text>
			{/each}
		</Stack>
	</Panel>

	<Panel title="Installations">
		<table class="w-full text-sm">
			<thead class="text-left text-light-600">
				<tr>
					<th class="py-1 font-normal">Account</th>
					<th class="py-1 font-normal">Installed</th>
					<th class="py-1 text-right font-normal">Open</th>
					<th class="py-1 text-right font-normal">Blocked</th>
					<th class="py-1 text-right font-normal">Dismissed</th>
				</tr>
			</thead>
			<tbody class="tabular-nums">
				{#each data.installations as installation (installation.id)}
					<tr class="border-t border-light-300">
						<td class="py-1">
							{installation.login}
							<span class="text-light-600">· {installation.type.toLowerCase()}</span>
						</td>
						<td class="py-1">
							{when(installation.installedAt)}
							{#if installation.uninstalledAt}
								<span class="text-light-600">· removed {when(installation.uninstalledAt)}</span>
							{/if}
						</td>
						<td class="py-1 text-right">{installation.open}</td>
						<td class="py-1 text-right">{installation.blocked}</td>
						<td class="py-1 text-right">{installation.dismissed}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Panel>
</Stack>
