<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge, Button, Heading, Stack, Text } from '@immich/ui';
	import ActivityChart from '$lib/components/ActivityChart.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Panel from '$lib/components/Panel.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import DecisionButtons from '../../../DecisionButtons.svelte';
	import { onReviewChange } from '$lib/review-changes.svelte';
	import { flaggedAccount } from '../../../review.remote';

	const account = $derived(
		await flaggedAccount({ org: page.params.org!, login: page.params.login! })
	);

	onReviewChange(
		(event) =>
			'installationId' in event &&
			event.installationId === account.installationId &&
			event.userId === account.userId,
		() => flaggedAccount({ org: page.params.org!, login: page.params.login! }).refresh()
	);

	const BURST_PREVIEW = 8;
	let copied = $state(false);
	let showWholeBurst = $state(false);
	const shownBurst = $derived(
		showWholeBurst ? account.burst : account.burst.slice(0, BURST_PREVIEW)
	);
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
					{#if account.goneAt}
						<Badge color="secondary">gone from GitHub</Badge>
					{/if}
				</div>
				<Text size="small" color="muted">
					<ExternalLink href="https://github.com/{account.login}">GitHub profile</ExternalLink>
					{#if account.accountCreatedAt}· account from {account.accountCreatedAt.getFullYear()}{/if}
					{#if account.followers !== null}· {account.followers} followers{/if}
				</Text>
				{#if account.goneAt}
					<Text size="small" color="muted">
						GitHub no longer shows this account, deleted or suspended, as of {when(account.goneAt)}.
					</Text>
				{/if}
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

	<Panel>
		<div class="flex flex-wrap items-center gap-6">
			<div>
				<div class="text-3xl leading-tight font-bold tabular-nums">
					{account.score}/{account.maxScore}
				</div>
				<div class="text-xs text-light-600">score</div>
			</div>
			<div class="flex flex-wrap divide-x divide-light-300">
				{#each account.stats as stat (stat.signal)}
					<StatTile {...stat} />
				{/each}
			</div>
		</div>
		{#if account.dataAsOf}
			<Text size="small" color="muted" class="mt-3">History as of {when(account.dataAsOf)}</Text>
		{/if}
	</Panel>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
		<Stack gap={6} class="min-w-0">
			<Panel title={`In ${account.org}`}>
				<Stack gap={2}>
					{#each account.commentsHere as comment (comment.id)}
						<details class="group rounded-lg bg-subtle p-3">
							<summary class="cursor-pointer list-none">
								<Text size="small" color="muted">
									<span class="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
									<ExternalLink href={comment.url}>{comment.repository}</ExternalLink>
									{#if comment.category}· {comment.category}{/if} · {when(comment.createdAt)}
									{#if comment.edits.length}
										· <span class="font-semibold">edited</span>
									{/if}
								</Text>
								<Text class="mt-1 truncate group-open:hidden">{comment.body}</Text>
							</summary>
							<Text class="mt-1 whitespace-pre-line">{comment.body}</Text>
							{#each comment.edits as edit (edit.replacedAt.getTime())}
								<div class="mt-3 border-l-2 border-light-300 pl-3">
									<Text size="small" color="muted"
										>Earlier version, until {when(edit.replacedAt)}</Text
									>
									<Text class="mt-1 whitespace-pre-line text-light-600">{edit.body}</Text>
								</div>
							{/each}
						</details>
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
					<ul class="mt-2 divide-y divide-light-300">
						{#each shownBurst as comment (comment.createdAt.getTime() + comment.url)}
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
					{#if account.burst.length > BURST_PREVIEW && !showWholeBurst}
						<Button variant="ghost" size="small" onclick={() => (showWholeBurst = true)}>
							Show all {account.burst.length}
						</Button>
					{/if}
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
				<Stack gap={3}>
					{#each account.decisions as decision (decision.decidedAt.getTime())}
						<Text size="small">
							<b>{decision.action}</b> by {decision.actor}<br />
							<span class="text-light-600">{when(decision.decidedAt)}</span>
							{#if decision.block?.status === 'pending'}
								<br /><span class="text-light-600">Waiting to be carried out on GitHub</span>
							{:else if decision.block?.status === 'failed'}
								<br /><span class="text-danger">Failed on GitHub: {decision.block.error}</span>
							{/if}
							{#if decision.hidden}
								{@const comments = `${decision.hidden.total} comment${decision.hidden.total === 1 ? '' : 's'}`}
								<br />
								{#if decision.hidden.status === 'done'}
									<span class="text-light-600">Hid {comments}</span>
								{:else if decision.hidden.status === 'pending'}
									<span class="text-light-600">Hiding {comments}</span>
								{:else}
									<span class="text-danger">
										Couldn't hide all {comments}: {decision.hidden.error}
									</span>
								{/if}
							{/if}
						</Text>
					{:else}
						<Text size="small" color="muted">None yet.</Text>
					{/each}
				</Stack>
			</Panel>
		</Stack>
	</div>
</Stack>
