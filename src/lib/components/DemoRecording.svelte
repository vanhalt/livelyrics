<script lang="ts">
	import { onDestroy } from 'svelte';
	import recording from '../../../volvere.webm?url';
	import { positionAt, type Playback } from '../index';
	let { playback, duration, clock }: { playback: Playback; duration: number; clock: () => number } =
		$props();
	let video: HTMLVideoElement;
	let source = $state(recording);
	let fallback: AbortController | undefined;
	let blobUrl: string | undefined;
	// Some static asset servers return the whole file for a byte-range request.
	// A local blob gives the media element a seekable source on those servers.
	async function updateMedia() {
		if (!video || video.readyState < 1) return;
		if (
			source === recording &&
			!fallback &&
			(!video.seekable.length || video.seekable.end(video.seekable.length - 1) === 0)
		) {
			fallback = new AbortController();
			try {
				const response = await fetch(recording, { signal: fallback.signal });
				if (!response.ok) throw Error('Recording unavailable');
				const blob = await response.blob();
				if (fallback.signal.aborted) return;
				blobUrl = URL.createObjectURL(blob);
				source = blobUrl;
				return;
			} catch {
				if (fallback.signal.aborted) return;
			}
		}
		await synchronize();
	}
	onDestroy(() => {
		fallback?.abort();
		if (blobUrl) URL.revokeObjectURL(blobUrl);
	});
	let blocked = $state(false),
		failed = $state(false);
	function align(force = false) {
		if (!video || video.readyState < 1) return;
		const seconds = Math.min(video.duration, positionAt(playback, clock(), duration) / 1000);
		if (Math.abs(video.currentTime - seconds) > (force ? 0.015 : 0.2)) video.currentTime = seconds;
		video.playbackRate = playback.rate;
		return playback.playing && seconds < video.duration;
	}
	async function synchronize() {
		if (!video || video.readyState < 1) return;
		if (!align(true)) {
			video.pause();
			blocked = false;
			return;
		}
		try {
			await video.play();
			blocked = false;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'NotAllowedError') blocked = true;
		}
	}
	$effect(() => {
		playback;
		void updateMedia();
		if (playback.playing) {
			const timer = setInterval(() => align(), 500);
			return () => clearInterval(timer);
		}
	});
</script>

<div class="recording">
	<!-- svelte-ignore a11y_media_has_caption (The synchronized transcript is displayed alongside the recording.) -->
	<video
		bind:this={video}
		src={source}
		playsinline
		preload="metadata"
		onloadedmetadata={updateMedia}
		onerror={() => (failed = true)}
		aria-label="Volveré recording"
	></video>
	{#if blocked}<button onclick={synchronize}>Enable recording</button>{/if}
	{#if failed}<small role="status">Recording unavailable</small>{/if}
</div>
