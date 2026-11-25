import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLrc, positionAt, applyCommand, initial, cueIndex } from '../src/lib/index.ts';

test('sample metadata, instrumental break and duration', () => {
	const sample = parseLrc(readFileSync(new URL('../src/lib/sample.lrc', import.meta.url), 'utf8'));
	assert.equal(sample.title, 'Midnight Tides');
	assert.equal(sample.duration, 45000);
	assert.deepEqual(sample.cues[5], { time: 21000, text: '' });
});
test('Volveré starts after its intro', () => {
	const track = parseLrc(readFileSync(new URL('../volvere.lrc', import.meta.url), 'utf8'));
	assert.equal(track.title, 'Volveré');
	assert.equal(track.artist, 'Rubby Pérez');
	assert.equal(cueIndex(track, 15079), -1);
	assert.equal(cueIndex(track, 15080), 0);
});
test('multiple stamps, stable duplicates and duration fallback', () => {
	const t = parseLrc('[00:15.123][00:02:5]A\r\n[00:02.50]B');
	assert.deepEqual(
		t.cues.map((c) => c.time),
		[2500, 2500, 15123]
	);
	assert.equal(t.cues[cueIndex(t, 2500)].text, 'B');
	assert.equal(t.duration, 19123);
});
test('changing rate, pausing, seeking and replaying use the same clock', () => {
	let p = initial();
	const command = (c, time) => {
		p = applyCommand(p, c, time, 10000);
	};
	command({ type: 'play' }, 100);
	command({ type: 'rate', value: 2 }, 1100);
	assert.equal(positionAt(p, 1500, 10000), 1800);
	command({ type: 'pause' }, 1500);
	assert.equal(positionAt(p, 4000, 10000), 1800);
	command({ type: 'seek', value: 9900 }, 4000);
	command({ type: 'play' }, 5000);
	assert.equal(positionAt(p, 5200, 10000), 10000);
	command({ type: 'play' }, 5200);
	assert.equal(positionAt(p, 5200, 10000), 0);
});
