import { XMLParser } from 'fast-xml-parser';
import { array, number, object, safeParse, string } from 'valibot';

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
