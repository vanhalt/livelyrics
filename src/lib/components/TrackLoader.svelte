<script lang="ts">
	import sample from '../../../volvere.lrc?raw';
	import { parseLrc, formatTime } from '../index';
	let {
		raw,
		apply,
		close
	}: { raw: string; apply: (text: string) => Promise<void>; close: () => void } = $props();
	let draft = $state(''),
		dialog: HTMLDialogElement,
		message = $state(''),
		busy = $state(false);
	let preview = $derived(parseLrc(draft));
	import { onMount } from 'svelte';
	onMount(() => {
		draft = raw;
		dialog.showModal();
	});
	async function submit() {
		busy = true;
		try {
			await apply(draft);
			close();
		} catch (e) {
			message = String(e);
		} finally {
			busy = false;
		}
	}
</script>

<dialog class="track-loader" aria-labelledby="loader-heading" bind:this={dialog} onclose={close}>
	<div class="sheet-heading">
		<h2 id="loader-heading">Load lyrics</h2>
		<button aria-label="Close lyric loader" onclick={close}>✕</button>
	</div>
	<label>
		LRC or text file <input
			type="file"
			accept=".lrc,.txt,text/plain"
			onchange={async (e) => {
				const file = e.currentTarget.files?.[0];
				if (file)
					try {
						if (file.size > 65536) throw Error('Maximum file size is 64 KiB');
						draft = await file.text();
						message = '';
					} catch (err) {
						message = String(err);
					}
			}}
		/>
	</label>
	<label>
		Timed lyrics<textarea bind:value={draft} rows="8" placeholder="[00:01.00]First line"></textarea>
	</label>
	<div class="actions">
		<button onclick={() => (draft = sample)}>Load Volveré demo</button><button
			onclick={() => (draft = '')}
		>
			Clear
		</button>
	</div>
	<p>
		{preview.cues.length
			? preview.title + ' · ' + preview.cues.length + ' cues · ' + formatTime(preview.duration)
			: 'Add at least one timestamped line.'}
	</p>
	{#if message}<p role="alert">{message}</p>{/if}
	<div class="actions dialog-actions">
		<button onclick={close}>Cancel</button><button
			class="accent"
			disabled={!preview.cues.length || busy || new TextEncoder().encode(draft).length > 65536}
			onclick={submit}
		>
			Apply lyrics
		</button>
	</div>
</dialog>
