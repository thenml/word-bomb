export type Verglas = string;

const unixPersicion = 100;
const unixOffset = new Date("2024-01-01").getTime() / unixPersicion;

export function isVerglas(verglas: string) {
	return /^[0-9a-f]{4,}$/i.test(verglas);
}

export function parseVerglas(verglas: Verglas) {
	if (!isVerglas(verglas)) throw new Error("Input is not Verglas format");

	const unixTime =
		(parseInt(verglas.substring(0, verglas.length - 4), 16) + unixOffset) * unixPersicion;
	const combinedId = parseInt(verglas.substring(verglas.length - 4), 16);

	let machineId = 0;
	for (let i = 0; i < 8; i++) {
		machineId |= ((combinedId >> (2 * i)) & 1) << i;
	}

	return { machineId, unixTime };
}

export function asSmall(verglas: Verglas) {
	if (!isVerglas(verglas)) throw new Error("Input is not Verglas format");

	const unixTime = verglas.substring(verglas.length - 8, verglas.length - 4);
	const intertwined = verglas.substring(verglas.length - 2);

	return `${unixTime}${intertwined}`;
}

export class VerglasFactory {
	private readonly machineId: number;
	private incrementer = Math.random() * 0x100;

	constructor(options: { machineId: number }) {
		if (options.machineId < 0 || options.machineId > 0xff) {
			throw new Error("machineId must be in range 0-255");
		}
		this.machineId = options.machineId;
	}

	public next(): Verglas {
		const time = Math.floor(Date.now() / unixPersicion - unixOffset);

		let intertwined = 0;
		for (let i = 0; i < 8; i++) {
			intertwined |= ((this.machineId >> i) & 1) << (2 * i);
			intertwined |= ((this.incrementer >> i) & 1) << (2 * i + 1);
		}
		this.incrementer = (this.incrementer + 71) % 0x100; // 71 is coprime to 100

		return `${time.toString(16)}${intertwined.toString(16).padStart(4, "0")}` as Verglas;
	}

	public nextSmall(): string {
		const time = Math.floor(Date.now() / unixPersicion - unixOffset) % 0x10000;

		let intertwined = 0;
		for (let i = 0; i < 4; i++) {
			intertwined |= ((this.machineId >> i) & 1) << (2 * i);
			intertwined |= ((this.incrementer >> i) & 1) << (2 * i + 1);
		}
		this.incrementer = (this.incrementer + 71) % 0x100;

		return `${time.toString(16)}${intertwined.toString(16).padStart(2, "0")}`;
	}
}
