# Live Lyrics

The player opens with Volveré by Rubby Pérez. Press Play to start the bundled video and synchronized lyrics. The host plays the recording while viewers follow the lyrics. Choose **Load Volveré demo** in the lyric loader to restore the recording after using a custom track.

Load a timed LRC file or paste lyrics into the player. Press Space to play or pause, click a lyric to seek, or start a live room and copy the viewer link. Anyone with that link can follow the song and scroll independently. The host can refresh the page and keep control in the same browser. End room closes the stream for everyone and removes the stored song.

## Run locally

Install dependencies with `pnpm install`. Run `pnpm run preview` for a production build served locally with both Cloudflare Workers. Open the printed app URL and test the viewer link in another browser window. For hot reload, run `pnpm run dev:rooms` and `pnpm dev` in separate terminals.

## How synchronization works

The framework-independent library in `src/lib/index.ts` parses LRC input and calculates the active cue from a playback position. Each live room has one SQLite-backed Durable Object that stores its lyrics and playback clock. Host commands use same-origin POST requests with a room-specific HTTP-only cookie and a revision check. SSE subscribers get the full track on connection or replacement. Play, pause, speed, and seek events carry just the revised clock. Clients sample server time and advance locally between events. A late or reconnecting viewer starts with the current snapshot.

## Check and deploy

Run `pnpm test` (Node 22.18 or newer), `pnpm run check`, and `pnpm run build`. With Wrangler authenticated, `pnpm run deploy` deploys the room Worker first, then the SvelteKit app with its room binding.
