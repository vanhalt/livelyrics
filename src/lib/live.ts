import type { Snapshot } from './index';

export async function post(path: string, body: unknown) {
	const response = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok)
		throw new Error(
			response.status === 413 ? 'File too large' : (await response.text()) || 'Request failed'
		);
	return response;
}
export function connectRoom(
	id: string,
	onState: (data: Partial<Snapshot>, offset: number) => void,
	status: (message: string, host: boolean) => void
) {
	const base = '/api/rooms/' + id;
	const events = new EventSource(base + '/events');
	const abort = new AbortController();
	let offset: number | undefined,
		host = false,
		live = false,
		sequence = 0;
	async function calibrate() {
		const run = ++sequence;
		let best = Infinity;
		try {
			for (let i = 0; i < 3; i++) {
				const start = performance.now();
				const response = await fetch(base + '/clock', { signal: abort.signal, cache: 'no-store' });
				if (run !== sequence || abort.signal.aborted) return;
				if (response.status === 404) {
					close();
					status('Room closed or unavailable', false);
					return;
				}
				if (!response.ok) throw Error();
				const sample = (await response.json()) as { serverTime: number; host: boolean };
				if (run !== sequence || abort.signal.aborted) return;
				const elapsed = performance.now() - start;
				if (elapsed < best) {
					best = elapsed;
					offset = sample.serverTime - start - elapsed / 2;
					host = sample.host;
					onState({}, offset!);
					if (live) status('Live', host);
				}
			}
		} catch {
			/* EventSource retries the stream on network loss. */
		}
	}
	for (const type of ['snapshot', 'playback'])
		events.addEventListener(type, (event: MessageEvent) => {
			const data = JSON.parse(event.data) as Snapshot;
			onState(data, offset ?? data.serverTime - performance.now());
			live = true;
			status('Live', host);
		});
	events.onopen = calibrate;
	events.onerror = () => {
		live = false;
		status('Reconnecting…', false);
		void calibrate();
	};
	events.addEventListener('ended', () => {
		close();
		status('Room ended', false);
	});
	function resume() {
		if (!document.hidden) void calibrate();
	}
	function close() {
		events.close();
		abort.abort();
		document.removeEventListener('visibilitychange', resume);
	}
	document.addEventListener('visibilitychange', resume);
	return close;
}
