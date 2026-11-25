import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, url, cookies, params }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Origin mismatch');
	const rooms = env.ROOMS;
	if (!rooms) error(503, 'Room service unavailable');
	const create = !params.path;
	const [id, action, ...extras] = (params.path || crypto.randomUUID() + '/create').split('/');
	if (!/^[a-f0-9-]{36}$/.test(id) || extras.length || (!create && action !== 'commands'))
		error(404);
	// Bound the JSON envelope before forwarding it to the room.
	const reader = request.body?.getReader();
	if (!reader) error(400);
	const decoder = new TextDecoder();
	let body = '',
		size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > 400000) {
			await reader.cancel();
			error(413, 'File too large');
		}
		body += decoder.decode(value, { stream: true });
	}
	body += decoder.decode();
	const token = create ? crypto.randomUUID() : (cookies.get('host') ?? '');
	const response = await rooms
		.getByName(id)
		.fetch('https://room/' + action, { method: 'POST', headers: { 'X-Host': token }, body });
	if (!create || !response.ok) return response;
	cookies.set('host', token, {
		path: '/api/rooms/' + id,
		httpOnly: true,
		sameSite: 'strict',
		secure: url.protocol === 'https:'
	});
	return json({ host: '/host/' + id, viewer: '/view/' + id }, { status: 201 });
};
export const GET: RequestHandler = ({ params, cookies }) => {
	const [id, action, ...extras] = (params.path ?? '').split('/');
	if (!/^[a-f0-9-]{36}$/.test(id) || extras.length || !['events', 'clock'].includes(action))
		error(404);
	return env.ROOMS.getByName(id).fetch('https://room/' + action, {
		headers: { 'X-Host': cookies.get('host') ?? '' }
	});
};
