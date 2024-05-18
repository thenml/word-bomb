import fs from "fs";
import iconv from "iconv-lite";

// Function to generate segments from a word
function generateSegments(word: string) {
	const segments: any = {};
	const length = word.length;

	for (let i = 2; i <= 6; i++) {
		for (let j = 0; j <= length - i; j++) {
			const segment = word.slice(j, j + i);
			if (doesWordExist(segment)) continue;
			if (!segments[i]) segments[i] = {};
			segments[i][segment] = (segments[i][segment] || 0) + 1;
		}
	}

	return segments;
}

// Function to merge segment counts into the main object
function mergeSegments(mainSegments: any, wordSegments: any) {
	for (const length in wordSegments) {
		if (!mainSegments[length]) {
			mainSegments[length] = { _total: 0 };
		}
		for (const segment in wordSegments[length]) {
			if (!mainSegments[length][segment]) {
				mainSegments[length][segment] = 0;
			}
			const count = wordSegments[length][segment];
			mainSegments[length][segment] += count;
			mainSegments[length]._total += count;
		}
	}
}

const trie = {};
fs.readFile("./wordlists/russian.txt", (err, data) => {
	if (err) throw err;
	const words = iconv.decode(data, "cp1251").toString().split(/\r?\n/);
	if (words.length < 1) throw new Error("No words found");
	buildTrie(trie, words);
	genParts();
});

function buildTrie(root: any, words: string[]) {
	const startTime = Date.now();
	for (const word of words) {
		let node: any = root;
		for (const char of word) {
			if (!node[char]) {
				node[char] = {};
			}
			node = node[char];
		}
		node.true = true;
	}
	console.log(`Trie built in ${Date.now() - startTime}ms`);
	return root;
}
function doesWordExist(word: string) {
	let node: any = trie;
	for (const char of word) {
		node = node[char];
		if (!node) return false;
	}
	return !!node.true;
}

function genParts() {
	fs.readFile("./wordlists/russian.txt", (err, data) => {
		if (err) throw err;
		const lines = iconv.decode(data, "cp1251").toString().split(/\r?\n/);

		const mainSegments: any = {};

		console.log(lines.length);

		for (const line of lines) {
			if (line.length < 3) continue;
			const wordSegments = generateSegments(line);
			mergeSegments(mainSegments, wordSegments);
		}

		console.log("sorting");

		// Sort the keys in each segment by count
		for (const length in mainSegments) {
			const segmentEntries = Object.entries(mainSegments[length]);
			segmentEntries.sort((a: any, b: any) => b[1] - a[1]);
			mainSegments[length] = Object.fromEntries(segmentEntries);
		}

		console.log("writing");

		fs.writeFileSync("./wordlists/parts.json", JSON.stringify(mainSegments, null, 2));

		console.log("done");
	});
}
