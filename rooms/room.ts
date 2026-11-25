import { DurableObject } from 'cloudflare:workers';
import { applyCommand, initial, parseLrc, type Command, type Playback } from '../src/lib/index';

interface Room {
	raw: string;
	duration: number;
	playback: Playback;
	host: string;
	revision: number;
}
function validTrack(raw: unknown) {
	if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 65536) return;
	const track = parseLrc(raw);
	if (track.cues.length) return track;
}
function validCommand(c: Command) {
	switch (c?.type) {
		case 'play':
		case 'pause':
		case 'reset':
		case 'end':
			return true;
		case 'seek':
			return Number.isFinite(c.value);
		case 'rate':
			return [1, 1.5, 2].includes(c.value);
		case 'load':
			return !!validTrack(c.raw);
		default:
			return false;
	}
}

export class LyricsRoom extends DurableObject {
	private listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();
	private pulse?: ReturnType<typeof setInterval>;
	private sql = this.ctx.storage.sql;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
	}
	private emit(controller: ReadableStreamDefaultController<Uint8Array>, frame: string) {
		try {
			controller.enqueue(new TextEncoder().encode(frame));
		} catch {
			this.remove(controller);
		}
	}
	private remove(controller: ReadableStreamDefaultController<Uint8Array>) {
		this.listeners.delete(controller);
		if (!this.listeners.size) {
			clearInterval(this.pulse);
			this.pulse = undefined;
		}
	}
	private frame(room: Room, full: boolean) {
		return (
			'id: ' +
			room.revision +
			'\nevent: ' +
			(full ? 'snapshot' : 'playback') +
			'\ndata: ' +
			JSON.stringify({
				revision: room.revision,
				playback: room.playback,
				serverTime: Date.now(),
				...(full && { raw: room.raw })
			}) +
			'\n\n'
		);
	}
	private save(room: Room) {
		this.sql.exec('INSERT OR REPLACE INTO room VALUES (1,?)', JSON.stringify(room));
	}
	async fetch(request: Request) {
		const action = new URL(request.url).pathname;
		const host = request.headers.get('X-Host') ?? '';
		// Read the body before the synchronous read/modify/write section.
		let body;
		if (request.method === 'POST') {
			try {
				body = await request.json<{
					raw: string;
					playback: Playback;
					revision: number;
					command: Command;
				}>();
			} catch {
				return new Response('Invalid JSON', { status: 400 });
			}
		}
		const row = this.sql.exec<{ data: string }>('SELECT data FROM room WHERE id=1').toArray()[0];
		const room: Room | undefined = row && JSON.parse(row.data);
		if (action === '/create' && request.method === 'POST' && !room && host) {
			const track = validTrack(body?.raw),
				p = body?.playback;
			if (
				!body ||
				!track ||
				!p ||
				!Number.isFinite(p.position) ||
				typeof p.playing !== 'boolean' ||
				![1, 1.5, 2].includes(p.rate)
			)
				return new Response('Choose valid timed lyrics (maximum 64 KiB).', { status: 400 });
			this.save({
				raw: body.raw,
				duration: track.duration,
				host,
				revision: 1,
				playback: {
					...initial(),
					position: Math.min(track.duration, Math.max(0, p.position)),
					playing: p.playing,
					rate: p.rate,
					at: Date.now()
				}
			});
			return new Response(null, { status: 201 });
		}
		if (!room) return new Response('Room unavailable', { status: 404 });
		if (action === '/clock')
			return Response.json(
				{ serverTime: Date.now(), host: host === room.host },
				{ headers: { 'Cache-Control': 'no-store' } }
			);
		if (action === '/events') {
			let subscriber: ReadableStreamDefaultController<Uint8Array>;
			const stream = new ReadableStream<Uint8Array>({
				start: (controller) => {
					subscriber = controller;
					this.listeners.add(controller);
					this.emit(controller, this.frame(room, true));
					this.pulse ??= setInterval(() => {
						for (const c of this.listeners) this.emit(c, ': heartbeat\n\n');
					}, 15000);
				},
				cancel: () => this.remove(subscriber)
			});
			return new Response(stream, {
				headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }
			});
		}
		if (action !== '/commands' || request.method !== 'POST')
			return new Response(null, { status: 404 });
		if (host !== room.host) return new Response('Host access required', { status: 403 });
		if (body?.revision !== room.revision)
			return new Response('Playback changed. Try again.', { status: 409 });
		const c: Command = body.command;
		if (!validCommand(c))
			return new Response('Invalid playback command or LRC file', { status: 400 });
		if (c.type === 'end') {
			this.sql.exec('DELETE FROM room');
			for (const listener of this.listeners) {
				this.emit(listener, 'event: ended\ndata: {}\n\n');
				listener.close();
				this.remove(listener);
			}
		} else {
			room.playback = applyCommand(room.playback, c, Date.now(), room.duration);
			if (c.type === 'load') {
				room.raw = c.raw;
				room.duration = parseLrc(c.raw).duration;
			}
			room.revision++;
			this.save(room);
			const frame = this.frame(room, c.type === 'load');
			for (const listener of this.listeners) this.emit(listener, frame);
		}
		return new Response(null, { status: 204 });
	}
}
export default { fetch: () => new Response(null, { status: 404 }) };
