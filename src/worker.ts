import { XMLParser } from 'fast-xml-parser';
import { array, number, object, safeParse, string } from 'valibot';
/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
	//
	// Example binding to a D1 Database. Learn more at https://developers.cloudflare.com/workers/platform/bindings/#d1-database-bindings
	// DB: D1Database
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
		// For example, the request URL my-worker.account.workers.dev/image.png
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		// Retrieve the key "image.png"
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

async function fetchStations(xmlParser: XMLParser): Promise<Station[]> {
	const res = await fetch('http://radiko.jp/v3/station/list/JP13.xml');
	const stationsXml = await res.text();
	const json = xmlParser.parse(stationsXml);
	const result = safeParse(stationResponseSchema, json);
	if (!result.success) {
		console.error(result.error);
		throw new Error('parse failed');
	}
	return result.data.stations.station.map((it) => ({ id: it.id, name: it.name }));
}

async function fetchPrograms(stationId: string, xmlParser: XMLParser): Promise<ProgramsInDate[]> {
	const url = `http://radiko.jp/v3/program/station/weekly/${stationId}.xml`;
	const res = await fetch(url);
	const xml = await res.text();
	const json = xmlParser.parse(xml);
	const result = safeParse(programResponseSchema, json);
	if (!result.success) {
		console.error(result.error);
		throw new Error('parse failed');
	}
	return result.data.radiko.stations.station.progs.map((program) => {
		const prog = program.prog.map<Program>((it) => ({
			id: it.id,
			ft: it.ft,
			to: it.to,
			dur: it.dur,
			title: it.title,
			url: it.url,
			info: it.info,
			img: it.img,
			personality: it.pfm,
		}));
		return { date: program.date, programs: prog };
	});
}

type Station = {
	id: string;
	name: string;
};

type Program = {
	id: string;
	ft: string;
	to: string;
	dur: string;
	title: string;
	url: string;
	info: string;
	img: string;
	personality: string;
};

type ProgramsInDate = {
	date: number;
	programs: Program[];
};

const stationResponseSchema = object({ stations: object({ station: array(object({ id: string(), name: string() })) }) });

const programResponseSchema = object({
	radiko: object({
		stations: object({
			station: object({
				id: string(),
				name: string(),
				progs: array(
					object({
						date: number(),
						prog: array(
							object({
								id: string(),
								ft: string(),
								to: string(),
								dur: string(),
								title: string(),
								url: string(),
								desc: string(),
								info: string(),
								pfm: string(),
								img: string(),
							})
						),
					})
				),
			}),
		}),
	}),
});
