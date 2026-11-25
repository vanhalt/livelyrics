<script lang="ts">
	import { formatTime, type Command, type Playback } from '../index';
	let {
		position,
		duration,
		playback,
		send,
		disabled
	}: {
		position: number;
		duration: number;
		playback: Playback;
		send: (c: Command) => void;
		disabled: boolean;
	} = $props();
	let scrub = $state<number | null>(null);
	let playing = $derived(playback.playing && position < duration);
</script>

<fieldset {disabled} class="transport">
	<legend>Playback</legend>
	<div class="timeline">
		<time>{formatTime(scrub ?? position)}</time><input
			aria-label="Playback position"
			aria-valuetext={formatTime(scrub ?? position)}
			style:--progress={(100 * (scrub ?? position)) / duration + '%'}
			type="range"
			min="0"
			max={duration}
			step="1"
			value={scrub ?? position}
			oninput={(e) => (scrub = e.currentTarget.valueAsNumber)}
			onchange={(e) => {
				send({ type: 'seek', value: e.currentTarget.valueAsNumber });
				scrub = null;
			}}
			onpointercancel={() => (scrub = null)}
		/><time>{formatTime(duration)}</time>
	</div>
	<div class="controls">
		<button class="reset" onclick={() => send({ type: 'reset' })}>Reset</button>
		<button
			class="skip"
			aria-label="Back 5 seconds"
			onclick={() => send({ type: 'seek', value: position - 5000 })}
		>
			−5s
		</button>
		<button
			class="play accent"
			aria-label={playing ? 'Pause' : 'Play'}
			title={playing ? 'Pause' : 'Play'}
			onclick={() => send({ type: playing ? 'pause' : 'play' })}
		>
			<span class:paused={!playing} aria-hidden="true"></span>
		</button>
		<button
			class="skip"
			aria-label="Forward 5 seconds"
			onclick={() => send({ type: 'seek', value: position + 5000 })}
		>
			+5s
		</button>
		<select
			aria-label="Playback speed"
			title="Playback speed"
			value={playback.rate}
			onchange={(e) => send({ type: 'rate', value: Number(e.currentTarget.value) })}
		>
			{#each [1, 1.5, 2] as rate}<option value={rate}>{rate}×</option>{/each}
		</select>
	</div>
</fieldset>
