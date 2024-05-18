import fs from "fs";
import iconv from "iconv-lite";

fs.readFile("./wordlists/hagen-morph.txt", (err, data) => {
	if (err) throw err;
	let lines = iconv.decode(data, "cp1251").toString().split(/\r?\n/);

	console.log("filtering");
	const regex =
		/(?:(^[а-я]+) \| сущ [\S ]*ед \S+ (?:(?:им)|(?:нескл)))|(?:(^[а-я]+) \| прл ед муж им)/;
	// /(?:(^[а-я]+) \| сущ [\S ]*ед \S+ (?:(?:им)|(?:нескл)))|(?:(^[а-я]+) \| прл ед муж им)|(?:(^[а-я]+) \| гл [\S+ ]+ (?:(?:инф)|(?:ед (?:муж )?|)))|(?:(^[а-я]+) \| прч [\S+ ]+ ед муж (?:им )?\|)|(?:(^[а-я]+) \| (?:(?:дееп)|(?:нар)))/;
	lines = lines.filter(word => regex.test(word));

	if (lines.length < 1) throw new Error("No words found");

	console.log(lines.length);
	lines = lines.map(line => line.split(" ")[0]);
	// words.sort();
	fs.writeFileSync("./wordlists/russian.txt", iconv.encode(lines.join("\n"), "cp1251"));
	console.log("done");
});
