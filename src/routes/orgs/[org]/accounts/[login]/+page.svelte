<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Badge, Button, ConfirmModal, Heading, HStack, Stack, Text } from '@immich/ui';
	import ActivityChart from '$lib/components/ActivityChart.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import { decide, flaggedAccount } from '../../../review.remote';

	const account = $derived(
		await flaggedAccount({ org: page.params.org!, login: page.params.login! })
	);

	let confirmingBlock = $state(false);
	let blockForm = $state<HTMLFormElement>();
	let copied = $state(false);

	const when = (date: Date) =>
		date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	async function copySummary() {
		await navigator.clipboard.writeText(account.reportSummary);
		copied = true;
	}
</script>

<Stack gap={6}>
	<HStack class="justify-between">
		<a href={resolve('/orgs/[org]', { org: account.org })} class="text-sm text-gray-500">
			← {account.org}
		</a>
		{#if account.state === 'open'}
			<HStack>
				<form {...decide}>
					<input type="hidden" name="org" value={account.org} />
					<input type="hidden" name="caseId" value={account.caseId} />
					<input type="hidden" name="action" value="dismiss" />
					<Button type="submit" variant="outline" color="secondary">Dismiss</Button>
				</form>
				{#if account.canBlock}
					<form {...decide} bind:this={blockForm}>
						<input type="hidden" name="org" value={account.org} />
						<input type="hidden" name="caseId" value={account.caseId} />
						<input type="hidden" name="action" value="block" />
						<Button type="button" color="danger" onclick={() => (confirmingBlock = true)}>
							Block…
						</Button>
					</form>
				{/if}
			</HStack>
		{/if}
	</HStack>

	<Stack gap={2}>
		<HStack>
			<img
				src="https://github.com/{account.login}.png?size=80"
				alt=""
				class="size-10 rounded-full"
			/>
			<Heading size="medium">{account.login}</Heading>
			<Badge color={account.state === 'open' ? 'warning' : 'secondary'}>{account.state}</Badge>
		</HStack>
		<Text size="small" color="muted">
			<a href="https://github.com/{account.login}" target="_blank" rel="noreferrer"
				>GitHub profile ↗</a
			>
			{#if account.accountCreatedAt}· account from {account.accountCreatedAt.getFullYear()}{/if}
			{#if account.followers !== null}· {account.followers} followers{/if}
			{#if account.dataAsOf}· history as of {when(account.dataAsOf)}{/if}
		</Text>
	</Stack>

	<section>
		<Heading size="small">Score {account.score}/{account.rules.length}</Heading>
		<ul class="mt-2 space-y-1">
			{#each account.rules as rule (rule.name)}
				<li class={rule.fired ? '' : 'text-gray-400'}>
					{rule.fired ? '✓' : '·'}
					{rule.description}
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<Heading size="small">In {account.org}</Heading>
		<Stack gap={3} class="mt-2">
			{#each account.commentsHere as comment (comment.createdAt.getTime())}
				<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
					<Text size="small" color="muted">
						<ExternalLink href={comment.url}>{comment.repository}</ExternalLink>
						{#if comment.category}· {comment.category}{/if} · {when(comment.createdAt)}
					</Text>
					<Text class="mt-1 whitespace-pre-line">{comment.body}</Text>
				</div>
			{/each}
		</Stack>
	</section>

	<section>
		<Heading size="small">Across GitHub</Heading>
		<Text size="small" color="muted">Comments per day over the last 30 days</Text>
		<div class="mt-2"><ActivityChart days={account.activity} /></div>
		{#if account.burst.length > 0}
			<Text class="mt-4" fontWeight="semi-bold">
				Burst: {account.burst.length} comments in {new Set(account.burst.map((c) => c.repository))
					.size} repositories
			</Text>
			<ul class="mt-2 space-y-2">
				{#each account.burst as comment (comment.createdAt.getTime() + comment.url)}
					<li class="text-sm">
						<span class="text-gray-500 tabular-nums">{when(comment.createdAt)}</span>
						<ExternalLink href={comment.url}>{comment.repository}</ExternalLink>
						{#if comment.answerable}<Badge size="small">Q&A</Badge>{/if}
						<div class="truncate text-gray-600 dark:text-gray-400">{comment.body}</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<Heading size="small">Report to GitHub</Heading>
		<HStack class="mt-2">
			<Button href={account.reportUrl} target="_blank" rel="noreferrer" variant="outline">
				Open GitHub's report form ↗
			</Button>
			<Button variant="ghost" onclick={copySummary}>
				{copied ? 'Copied' : 'Copy evidence summary'}
			</Button>
		</HStack>
	</section>

	<section>
		<Heading size="small">Decisions</Heading>
		{#each account.decisions as decision (decision.decidedAt.getTime())}
			<Text size="small">{decision.action} by {decision.actor} · {when(decision.decidedAt)}</Text>
		{:else}
			<Text size="small" color="muted">None yet.</Text>
		{/each}
	</section>
</Stack>

{#if confirmingBlock}
	<ConfirmModal
		title="Block {account.login}?"
		prompt="They'll be blocked from all of {account.org}'s repositories."
		confirmText="Block"
		confirmColor="danger"
		onClose={(confirmed) => {
			confirmingBlock = false;
			if (confirmed) blockForm?.requestSubmit();
		}}
	/>
{/if}
