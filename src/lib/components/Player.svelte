<script lang="ts">
	import { onMount } from 'svelte';
	import sample from '../../../volvere.lrc?raw';
	import DemoRecording from './DemoRecording.svelte';
	import { parseLrc, applyCommand, initial, positionAt, formatTime, type Command } from '../index';
	import { post, connectRoom } from '../live';
	import LyricsView from './LyricsView.svelte';
	import TrackLoader from './TrackLoader.svelte';
	import Transport from './Transport.svelte';
	let { id = '', viewer = false }: { id?: string; viewer?: boolean } = $props();
	let raw = $state(sample),
		playback = $state(initial()),
		revision = $state(0),
		now = $state(0),
		offset = 0;
	let track = $derived(parseLrc(raw)),
		position = $derived(positionAt(playback, now, track.duration));
	let connection = $state('Connecting…'),
		host = $state(false),
		allowed = $derived(!viewer && (!id || host));
	let modal = $state(false),
		split = $state(false),
		busy = $state(false),
		notice = $state(''),
		share = $state('');
	let options: HTMLDialogElement;
	let wake = $state(false),
		keepAwake = false,
		sentinel: WakeLockSentinel | null = null;
	async function acquire() {
		try {
			sentinel = await navigator.wakeLock.request('screen');
			wake = true;
			sentinel.addEventListener('release', () => (wake = false), { once: true });
		} catch {
			keepAwake = false;
			notice = 'Screen wake lock unavailable.';
		}
	}
	onMount(() => {
		let frame = 0;
		function tick() {
			now = performance.now() + offset;
			frame = requestAnimationFrame(tick);
		}
		tick();
		const disconnect = id
			? connectRoom(
					id,
					(data, shift) => {
						offset = shift;
						now = performance.now() + offset;
						if (data.revision !== undefined && data.revision >= revision && data.playback) {
							if (data.raw !== undefined) raw = data.raw;
							playback = data.playback;
							revision = data.revision;
						}
					},
					(label, owner) => {
						connection = label;
						host = owner;
					}
				)
			: undefined;
		function visible() {
			if (!document.hidden && keepAwake && !wake) void acquire();
		}
		document.addEventListener('visibilitychange', visible);
		return () => {
			cancelAnimationFrame(frame);
			disconnect?.();
			document.removeEventListener('visibilitychange', visible);
			keepAwake = false;
			void sentinel?.release();
		};
	});
	async function command(c: Command) {
		if (!allowed || busy) throw Error('Playback unavailable');
		busy = true;
		notice = '';
		try {
			if (id) await post('/api/rooms/' + id + '/commands', { revision, command: c });
			else {
				playback = applyCommand(playback, c, performance.now(), track.duration);
				if (c.type === 'load') raw = c.raw;
			}
		} finally {
			busy = false;
		}
	}
	function send(c: Command) {
		void command(c).catch((e) => (notice = e.message));
	}
	async function start() {
		busy = true;
		notice = '';
		try {
			const res = await post('/api/rooms', {
				raw,
				playback: { ...playback, position, playing: playback.playing && position < track.duration }
			});
			location.assign(((await res.json()) as { host: string }).host);
		} catch (e) {
			notice = String(e);
			busy = false;
		}
	}
	async function shareRoom() {
		const url = location.origin + '/view/' + id;
		if (matchMedia('(pointer: coarse)').matches && navigator.share) {
			try {
				await navigator.share({ title: track.title + ' · Live Lyrics', url });
				return;
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
			}
		}
		await copy();
	}
	async function copy() {
		share = location.origin + '/view/' + id;
		try {
			await navigator.clipboard.writeText(share);
			notice = 'Viewer link copied.';
		} catch {
			notice = 'Copy the viewer link below.';
		}
	}
</script>

<svelte:head>
	<title>Live Lyrics · {track.title}</title>
</svelte:head>
<svelte:window
	onkeydown={(e) => {
		if (
			e.code === 'Space' &&
			!e.repeat &&
			allowed &&
			!busy &&
			!modal &&
			!options?.open &&
			!(e.target as HTMLElement)?.closest('button,input,textarea,select,a')
		) {
			e.preventDefault();
			send({ type: playback.playing && position < track.duration ? 'pause' : 'play' });
		}
	}}
/>
<div class="ambient" aria-hidden="true"><i></i><i></i><i></i></div>
<main class:audience={viewer}>
	<header>
		<a href="/" class="brand"><b aria-hidden="true">≋</b> Live Lyrics</a>
		<div class="actions">
			{#if allowed}<button class="desktop-load" onclick={() => (modal = true)}>Load lyrics</button>
				{#if !id}<button class="accent" disabled={busy} onclick={start}>
						Start room
					</button>{:else}<button class="accent" onclick={shareRoom}>Share room</button>{/if}{/if}
			<button
				class="more"
				aria-label="Player options"
				title="Player options"
				aria-haspopup="dialog"
				onclick={() => options.showModal()}
			>
				•••
			</button>
		</div>
	</header>
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if share}<input
			class="share"
			aria-label="Viewer link"
			readonly
			value={share}
			onfocus={(e) => e.currentTarget.select()}
		/>{/if}
	{#if id && (!revision || connection.startsWith('Room'))}
		<h1>{connection}</h1>
	{:else}
		<div class="trackinfo">
			{#if allowed && raw.trim() === sample.trim()}<DemoRecording
					{playback}
					duration={track.duration}
					clock={() => performance.now() + offset}
				/>{/if}
			<div>
				<div class="label">
					<i class:pulse={playback.playing && position < track.duration}></i>{id
						? connection + ' / ' + (viewer ? 'Viewer' : 'Host')
						: 'Local player'}
				</div>
				<h1>{track.title}</h1>
				<p>{track.artist}{track.album ? ' · ' + track.album : ''}</p>
			</div>
			<div class="duration"><span>{formatTime(position)}</span> / {formatTime(track.duration)}</div>
		</div>
		<div class="panels" class:split>
			<LyricsView
				{track}
				{position}
				onseek={allowed ? (value) => send({ type: 'seek', value }) : undefined}
			/>
			{#if split}<div class="preview">
					<div class="label">
						<i class:pulse={playback.playing && position < track.duration}></i>Viewer preview
					</div>
					<LyricsView {track} {position} />
					<div class="viewer-progress" aria-hidden="true">
						<span style:width={(100 * position) / track.duration + '%'}></span>
					</div>
				</div>{/if}
		</div>
		{#if allowed}<Transport
				{position}
				duration={track.duration}
				{playback}
				{send}
				disabled={busy}
			/>{/if}
	{/if}
</main>
{#if modal}<TrackLoader
		{raw}
		apply={(raw) => command({ type: 'load', raw })}
		close={() => (modal = false)}
	/>{/if}

<dialog bind:this={options} aria-labelledby="options-heading" class="player-options">
	<div class="sheet-heading">
		<h2 id="options-heading">Player options</h2>
		<button aria-label="Close options" onclick={() => options.close()}>✕</button>
	</div>
	<div class="option-list">
		{#if allowed}<button
				onclick={() => {
					options.close();
					modal = true;
				}}
			>
				Load lyrics
			</button>
			<button
				aria-pressed={split}
				onclick={() => {
					split = !split;
					options.close();
				}}
			>
				Viewer preview <span>{split ? 'On' : 'Off'}</span>
			</button>{/if}
		<button
			aria-pressed={wake}
			onclick={async () => {
				keepAwake = !keepAwake;
				if (keepAwake) await acquire();
				else await sentinel?.release();
				options.close();
			}}
		>
			Keep screen awake <span>{wake ? 'On' : 'Off'}</span>
		</button>
		{#if id && allowed}<button
				class="danger"
				onclick={() => {
					options.close();
					if (confirm('End this room for all viewers?')) send({ type: 'end' });
				}}
			>
				End room
			</button>{/if}
	</div>
</dialog>
