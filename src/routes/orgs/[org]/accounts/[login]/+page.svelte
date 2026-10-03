<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge, Button, Heading, Stack, Text } from '@immich/ui';
	import ActivityChart from '$lib/components/ActivityChart.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import DecisionButtons from '../../../DecisionButtons.svelte';
	import { flaggedAccount } from '../../../review.remote';

	const account = $derived(
		await flaggedAccount({ org: page.params.org!, login: page.params.login! })
	);

	let copied = $state(false);
	const when = (date: Date) =>
		date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const burstRepos = $derived(new Set(account.burst.map((c) => c.repository)).size);

	async function copySummary() {
		await navigator.clipboard.writeText(account.reportSummary);
		copied = true;
	}
</script>

<Stack gap={6}>
	<a
		href={resolve('/orgs/[org]', { org: account.org })}
		class="text-sm text-light-600 hover:text-dark"
	>
		← {account.org}
	</a>

	<header class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-4">
			<img
				src="https://github.com/{account.login}.png?size=96"
				alt=""
				class="size-14 rounded-full"
			/>
			<div>
				<div class="flex items-center gap-2">
					<Heading size="medium">{account.login}</Heading>
					<Badge color={account.state === 'open' ? 'warning' : 'secondary'}>{account.state}</Badge>
				</div>
				<Text size="small" color="muted">
					<ExternalLink href="https://github.com/{account.login}">GitHub profile</ExternalLink>
					{#if account.accountCreatedAt}· account from {account.accountCreatedAt.getFullYear()}{/if}
					{#if account.followers !== null}· {account.followers} followers{/if}
				</Text>
			</div>
		</div>
		{#if account.state === 'open'}
			<DecisionButtons
				org={account.org}
				caseId={account.caseId}
				login={account.login}
				canBlock={account.canBlock}
				then="next"
			/>
		{/if}
	</header>

	<Panel title="Why it's flagged">
		<div class="flex flex-wrap items-stretch gap-3">
			<div class="flex flex-col justify-center rounded-lg bg-subtle px-4 py-2">
				<div class="text-2xl font-bold tabular-nums">{account.score}/{account.rules.length}</div>
				<div class="text-xs text-light-600">score</div>
			</div>
			{#each account.stats as stat (stat.signal)}
				<StatTile {...stat} />
			{/each}
		</div>
		{#if account.dataAsOf}
			<Text size="small" color="muted" class="mt-3">History as of {when(account.dataAsOf)}</Text>
		{/if}
	</Panel>

	<div class="grid gap-6 lg:grid-cols-[1fr_18rem]">
		<Stack gap={6}>
			<Panel title={`In ${account.org}`}>
				<Stack gap={3}>
					{#each account.commentsHere as comment (comment.createdAt.getTime())}
						<div class="rounded-lg bg-subtle p-3">
							<Text size="small" color="muted">
								<ExternalLink href={comment.url}>{comment.repository}</ExternalLink>
								{#if comment.category}· {comment.category}{/if} · {when(comment.createdAt)}
							</Text>
							<Text class="mt-1 whitespace-pre-line">{comment.body}</Text>
						</div>
					{/each}
				</Stack>
			</Panel>

			<Panel title="Across GitHub">
				<Text size="small" color="muted">Comments per day over the last 30 days</Text>
				<div class="mt-2"><ActivityChart days={account.activity} /></div>
				{#if account.burst.length > 0}
					<Text class="mt-5" fontWeight="semi-bold">
						Burst: {account.burst.length} comments across {burstRepos} repositories
					</Text>
					<ul class="mt-2 divide-y divide-light-200">
						{#each account.burst as comment (comment.createdAt.getTime() + comment.url)}
							<li class="py-2 text-sm">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-light-600 tabular-nums">{when(comment.createdAt)}</span>
									<ExternalLink href={comment.url}>{comment.repository}</ExternalLink>
									{#if comment.answerable}<Badge size="small">Q&A</Badge>{/if}
								</div>
								<div class="mt-1 truncate text-light-600">{comment.body}</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Panel>
		</Stack>

		<Stack gap={6}>
			<Panel title="Report to GitHub">
				<Stack gap={2}>
					<Button
						href={account.reportUrl}
						target="_blank"
						rel="noreferrer"
						variant="outline"
						size="small"
					>
						Open GitHub's report form ↗
					</Button>
					<Button variant="ghost" size="small" onclick={copySummary}>
						{copied ? 'Copied' : 'Copy evidence summary'}
					</Button>
				</Stack>
			</Panel>

			<Panel title="Decisions">
				{#each account.decisions as decision (decision.decidedAt.getTime())}
					<Text size="small">
						<b>{decision.action}</b> by {decision.actor}<br />
						<span class="text-light-600">{when(decision.decidedAt)}</span>
					</Text>
				{:else}
					<Text size="small" color="muted">None yet.</Text>
				{/each}
			</Panel>
		</Stack>
	</div>
</Stack>
