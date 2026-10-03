<script lang="ts">
	import { Button, Checkbox, ConfirmModal, HStack, Label } from '@immich/ui';
	import { decide } from './review.remote';

	interface Props {
		org: string;
		caseId: number;
		login: string;
		canBlock: boolean;
		then: 'next' | 'queue';
		size?: 'small' | 'medium';
	}

	let { org, caseId, login, canBlock, then, size = 'medium' }: Props = $props();

	const dismissForm = $derived(decide.for(`dismiss-${caseId}`));
	const blockForm = $derived(decide.for(`block-${caseId}`));
	let confirming = $state(false);
	let hideComments = $state(true);
	let blockElement = $state<HTMLFormElement>();
</script>

<HStack>
	<form {...dismissForm}>
		<input type="hidden" name="org" value={org} />
		<input type="hidden" name="caseId" value={caseId} />
		<input type="hidden" name="action" value="dismiss" />
		<input type="hidden" name="then" value={then} />
		<Button type="submit" {size} variant="outline" color="secondary">Dismiss</Button>
	</form>
	{#if canBlock}
		<form {...blockForm} bind:this={blockElement}>
			<input type="hidden" name="org" value={org} />
			<input type="hidden" name="caseId" value={caseId} />
			<input type="hidden" name="action" value="block" />
			<input type="hidden" name="hideComments" value={hideComments ? 'yes' : 'no'} />
			<input type="hidden" name="then" value={then} />
			<Button type="button" {size} color="danger" onclick={() => (confirming = true)}>Block</Button>
		</form>
	{/if}
</HStack>

{#if confirming}
	<ConfirmModal
		title="Block {login}?"
		icon={false}
		prompt={blockPrompt}
		confirmText="Block"
		confirmColor="danger"
		onClose={(confirmed) => {
			confirming = false;
			if (confirmed) blockElement?.requestSubmit();
		}}
	/>
{/if}

{#snippet blockPrompt()}
	<p>They'll be blocked from all of {org}'s repositories.</p>
	<div class="mt-4 flex items-center gap-2">
		<Checkbox id="hide-comments-{caseId}" bind:checked={hideComments} />
		<Label for="hide-comments-{caseId}">Also hide their comments in {org}</Label>
	</div>
{/snippet}
