export interface Track {
	title: string;
	artist: string;
	album: string;
	cues: { time: number; text: string }[];
	duration: number;
}
const stamp = /(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?/;
const milliseconds = (m: string, s: string, f = '') => (+m * 60 + +s) * 1000 + +f.padEnd(3, '0');

export function parseLrc(raw: string): Track {
	const track: Track = {
		title: 'Untitled Track',
		artist: 'Unknown Artist',
		album: '',
		cues: [],
		duration: 0
	};
	const tags = new RegExp('\\[' + stamp.source + '\\]', 'g');
	for (const line of raw.trim().split(/\r?\n/)) {
		const meta = line.trim().match(/^\[(ti|ar|al|length)\s*:\s*(.*?)\s*\]$/i);
		if (meta) {
			const key = meta[1].toLowerCase();
			if (key === 'length') {
				const match = meta[2].match(new RegExp('^' + stamp.source + '$'));
				if (match) track.duration = milliseconds(match[1], match[2], match[3]);
			} else if (meta[2])
				track[({ ti: 'title', ar: 'artist', al: 'album' } as const)[key as 'ti' | 'ar' | 'al']] =
					meta[2];
			continue;
		}
		const text = line.replace(tags, '').trim();
		for (const match of line.matchAll(tags))
			track.cues.push({ time: milliseconds(match[1], match[2], match[3]), text });
	}
	track.cues.sort((a, b) => a.time - b.time);
	track.duration = Math.max(10000, track.duration, (track.cues.at(-1)?.time ?? 0) + 4000);
	return track;
}
export function cueIndex(track: Track, position: number) {
	let left = 0,
		right = track.cues.length;
	while (left < right) {
		const mid = Math.floor((left + right) / 2);
		if (track.cues[mid].time <= position) left = mid + 1;
		else right = mid;
	}
	return left - 1;
}
export function formatTime(ms: number) {
	const seconds = Math.floor(ms / 1000);
	return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
export type Playback = { position: number; at: number; playing: boolean; rate: number };
export const initial = (): Playback => ({ position: 0, at: 0, playing: false, rate: 1 });
export type Command =
	| { type: 'play' | 'pause' | 'reset' | 'end' }
	| { type: 'seek' | 'rate'; value: number }
	| { type: 'load'; raw: string };
export type Snapshot = { raw: string; playback: Playback; revision: number; serverTime: number };
export function positionAt(p: Playback, now: number, duration: number) {
	return Math.min(
		duration,
		Math.max(0, p.position + (p.playing ? Math.max(0, now - p.at) * p.rate : 0))
	);
}
export function applyCommand(
	p: Playback,
	command: Command,
	now: number,
	duration: number
): Playback {
	const position = positionAt(p, now, duration);
	const next = { ...p, position, at: now, playing: p.playing && position < duration };
	switch (command.type) {
		case 'play':
			return { ...next, playing: true, position: position === duration ? 0 : position };
		case 'pause':
			return { ...next, playing: false };
		case 'reset':
		case 'load':
			return initial();
		case 'seek':
			return { ...next, position: Math.max(0, Math.min(duration, command.value)) };
		case 'rate':
			return { ...next, rate: command.value };
		default:
			return next;
	}
}
