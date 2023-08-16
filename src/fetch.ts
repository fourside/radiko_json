import { type XMLParser } from 'fast-xml-parser';
import { array, number, object, safeParse, string } from 'valibot';

export async function fetchStations(xmlParser: XMLParser): Promise<Station[]> {
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

export async function fetchPrograms(stationId: string, xmlParser: XMLParser): Promise<ProgramsInDate[]> {
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

type ProgramsInDate = {
	date: number;
	programs: Program[];
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
