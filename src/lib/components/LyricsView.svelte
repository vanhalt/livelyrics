<script lang="ts">
	import { cueIndex, formatTime, type Track } from '../index';
	let {
		track,
		position,
		onseek
	}: { track: Track; position: number; onseek?: (ms: number) => void } = $props();
	let viewport: HTMLDivElement;
	let manual = $state(false);
	let index = $derived(cueIndex(track, position));
	$effect(() => {
		const current = index;
		track;
		if (!manual && viewport) {
			const row = viewport.children[Math.max(0, current)] as HTMLElement;
			if (row)
				viewport.scrollTo({
					top: row.offsetTop - viewport.clientHeight / 2 + row.offsetHeight / 2,
					behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
				});
		}
	});
</script>

{#snippet lyric(text: string)}
	{#if text}{text}{:else}<span class="instrumental">
			<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Instrumental
		</span>{/if}
{/snippet}

<section class="words">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The scroll region supports native keyboard scrolling.) -->
	<div
		class="viewport"
		bind:this={viewport}
		tabindex="0"
		role="region"
		aria-label="Synchronized lyrics"
		onwheel={() => (manual = true)}
		ontouchmove={() => (manual = true)}
		onkeydown={(e) => {
			if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key))
				manual = true;
		}}
	>
		{#each track.cues as cue, i}
			<div
				class="line"
				class:current={i === index}
				class:past={i < index}
				aria-current={i === index ? 'true' : undefined}
			>
				<small>{formatTime(cue.time)}</small>
				{#if onseek}<button onclick={() => onseek?.(cue.time)}>
						{@render lyric(cue.text)}
					</button>
				{:else}<span>{@render lyric(cue.text)}</span>{/if}
			</div>
		{/each}
	</div>
	{#if manual}<button class="follow" onclick={() => (manual = false)}>Return to live ↓</button>{/if}
</section>
