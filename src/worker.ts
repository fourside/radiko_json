import { XMLParser } from 'fast-xml-parser';
import { fetchPrograms, fetchStations } from './fetch';

export interface Env {
	MY_BUCKET: R2Bucket;
}

export default {
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
		try {
			const stations = await fetchStations(xmlParser);
			await env.MY_BUCKET.put('stations.json', JSON.stringify(stations));

			for (const station of stations) {
				const programs = await fetchPrograms(station.id, xmlParser);
				await env.MY_BUCKET.put(`programs/${station.id}.json`, JSON.stringify(programs));
			}
		} catch (error) {
			console.error(error);
			return;
		}
		console.log('success');
	},

	async fetch(request: Request, env: Env) {
		if (request.method.toLowerCase() !== 'get') {
			return new Response(null, { status: 405 });
		}
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		const object = await env.MY_BUCKET.get(key);

		if (object === null) {
			return new Response('Object Not Found', { status: 404 });
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);

		return new Response(object.body, {
			headers,
		});
	},
};
