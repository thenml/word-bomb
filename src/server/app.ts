import express from "express";
import io from "socket.io";
import { Verglas, VerglasFactory } from "../verglas";
import http from "http";
import crypto from "crypto";
import readline from "readline";
import iconv from "iconv-lite";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const ws = new io.Server(server, {});
const verglas = new VerglasFactory({ machineId: 0 });

const clients: { [key: Verglas]: Client } = {};
const games: { [key: Verglas]: Game } = {};
const gamesData: { [key: Verglas]: InternalGameData } = {};

export type Player = {
	id: Verglas;
	hp: number;
	profile: PlayerProfile;
	typing?: string;
	state: "current" | "waiting" | "dead" | "lobby" | "ready";
	incorrectGuesses: number;
};
export type Game = {
	id: Verglas;
	code: string;
	playerCount: number;
	players: { [key: Verglas]: Player };
	solo: boolean;
	state: {
		[key: string]: any;
	} & (
		| {
				type: "lobby";
				playersReady: number;
		  }
		| {
				type: "playing";
				currentPart: string;
				currentPlayer: Verglas;
				round: number;
				time: number;
				qi: number;
				difficulty: number;
		  }
		| {
				type: "starting";
		  }
		| {
				type: "winning";
				winner: Verglas;
		  }
	);
};
export type PlayerProfile = {
	name: string;
	pfp: string;
};
type Client = {
	id: Verglas;
	gameId?: Verglas;
	socket: io.Socket;
	player: Player;
};
type InternalGameData = {
	notPlayedPlayers: Verglas[];
};

app.use("/", express.static("dist"));
app.use("/u/", express.static("data/u"));
app.get("/rpfp/:seed", (req, res) => {
	res.redirect(
		`https://api.dicebear.com/8.x/fun-emoji/svg?seed=${req.params.seed}&radius=50&backgroundType=gradientLinear&eyes=closed,closed2,crying,cute,glasses,pissed,plain,shades,sleepClose,wink,sad&mouth=cute,drip,lilSmile,pissed,plain,sad,shout,shy,smileLol,tongueOut,wideSmile`
	);
});

const trie = {};
const parts = JSON.parse(fs.readFileSync("./wordlists/parts.json", "utf8"));
fs.readFile("./wordlists/russian.txt", (err, data) => {
	if (err) throw err;
	const words = iconv.decode(data, "cp1251").toString().split(/\r?\n/);
	if (words.length < 1) throw new Error("No words found");
	buildTrie(trie, words);
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
function newState(game: Game) {
	const gameData = gamesData[game.id];
	const { state } = game;

	if (state.currentPlayer) {
		const player = game.players[state.currentPlayer];
		player.state = "waiting";
		if (!game.solo) {
			setTimeout(() => {
				player.typing = "";
			}, 1000);
		}
	}
	state.qi++;
	state.difficulty += 0.06;

	// new part
	state.time = Math.round(30000 / state.difficulty ** 0.75);
	const partLength = Math.ceil((Math.random() + state.difficulty) / 5) + 1;
	const partSized = parts[partLength.toString()];

	const localDiffuculty = state.difficulty / partLength;
	const maxFreq = Math.min(
		Object.values(partSized)[1] as number,
		(Object.values(partSized)[1] as number) / localDiffuculty
	);
	const minFreq = maxFreq ** 0.75;

	const chooseParts = Object.entries(partSized)
		.filter(
			([part, freq]) =>
				(freq as number) < maxFreq &&
				(freq as number) > minFreq &&
				part !== state.currentPart &&
				part !== "_total"
		)
		.map(([part]) => part);
	// console.log(maxFreq, chooseParts.length);
	const partIndex = Math.floor(Math.random() * chooseParts.length);
	state.currentPart = chooseParts[partIndex];

	// new round
	if (gameData.notPlayedPlayers.length === 0) {
		state.round++;
		state.difficulty += game.playerCount / 15;
		gameData.notPlayedPlayers = Object.keys(game.players);
	}

	// next player
	let currentPlayerIndex = Math.floor(Math.random() * gameData.notPlayedPlayers.length);
	let currentPlayerId = gameData.notPlayedPlayers[currentPlayerIndex];
	if (!game.solo && currentPlayerId === state.currentPlayer) {
		gameData.notPlayedPlayers.splice(currentPlayerIndex, 1);
		currentPlayerIndex = Math.floor(Math.random() * gameData.notPlayedPlayers.length);
		currentPlayerId = gameData.notPlayedPlayers[currentPlayerIndex];
		gameData.notPlayedPlayers.push(state.currentPlayer);
	}
	gameData.notPlayedPlayers.splice(currentPlayerIndex, 1);
	game.players[currentPlayerId].state = "current";
	state.currentPlayer = currentPlayerId;

	setTimeout(
		function (qi: number, player: Player) {
			if (state.qi !== qi || !player) return;
			//s2c.timeUp(game.id, { playerId: currentPlayerId });
			player.hp--;
			if (player.hp === 0) {
				player.state = "dead";
				if (!game.solo)
					if (Object.values(game.players).filter(p => p.hp > 0).length === 1) {
						game.state = {
							type: "winning",
							winner: Object.keys(game.players).find(p => game.players[p].hp > 0)!,
						};
					}
			} else {
				newState(game);
			}
			s2c.updateGame(game);
		},
		state.time,
		state.qi,
		game.players[state.currentPlayer]
	);

	// console.log(JSON.stringify(state));
}

export const defaultPfpUrl = "/rpfp/";

// networking

ws.on("connection", (socket: io.Socket) => {
	socket.on("message", (message: string) => {
		const payload = JSON.parse(message);

		const [type, func] = (payload.method as string).split("-");
		if (type === "c2s") {
			if (func !== "typing") console.log(message);
			if (!Object.keys(c2s).includes(func)) return;
			c2s[func as keyof typeof c2s](socket, payload);
		}
	});
	socket.on("disconnecting", () => {
		const client = Object.values(clients).find(client => client.socket === socket);
		if (!client) return console.error("No client found");
		console.log(`Client ${client.id} disconnected`);

		if (client.gameId) {
			s2c.playerLeft(client.gameId, { playerId: client.player.id });
		}
		delete clients[client.id];
	});

	s2c.connect(socket);
});

const s2c = {
	connect: (socket: io.Socket) => {
		const clientId = verglas.next();
		const player: Player = {
			id: clientId,
			hp: 3,
			profile: {
				name: "Анонимус",
				pfp: defaultPfpUrl,
			},
			state: "lobby",
			incorrectGuesses: 0,
		};
		clients[clientId] = { id: clientId, socket, player };
		console.log(`new client ${clientId}`);
		socket.send(JSON.stringify({ method: "s2c-connect", clientId }));
	},

	createdRoom: (socket: io.Socket, payload: { game: Game }) => {
		socket.send(JSON.stringify({ method: "s2c-createdRoom", ...payload }));
		socket.join(payload.game.id);
	},

	joinedRoom: (socket: io.Socket, payload: { game?: Game; error?: number }) => {
		socket.send(JSON.stringify({ method: "s2c-joinedRoom", ...payload }));
		if (payload.game) socket.join(payload.game.id);
	},

	playerJoined: (gameId: Verglas, payload: { player: Player }) => {
		ws.to(gameId).emit("message", JSON.stringify({ method: "s2c-playerJoined", ...payload }));
	},

	playerLeft: (gameId: Verglas, payload: { playerId: Verglas }) => {
		ws.to(gameId).emit("message", JSON.stringify({ method: "s2c-playerLeft", ...payload }));
		const game = games[gameId];
		game.playerCount -= 1;
		if (game.playerCount === 0) {
			delete games[gameId];
			console.log(`Game ${gameId} ended`);
		} else if (game.state.currentPlayer === payload.playerId) {
			newState(game);
			s2c.updateGame(game);
		}
		delete game.players[payload.playerId];
	},

	updateGame: (game: Game) => {
		ws.to(game.id).emit("message", JSON.stringify({ method: "s2c-updateGame", game }));
	},
	typing: (gameId: Verglas, payload: { playerId: Verglas; typing: string }) => {
		ws.to(gameId).emit("message", JSON.stringify({ method: "s2c-typing", ...payload }));
	},
	answer: (gameId: Verglas, payload: { playerId: Verglas; answer: string; correct: boolean }) => {
		ws.to(gameId).emit("message", JSON.stringify({ method: "s2c-answer", ...payload }));
	},
	timeUp: (gameId: Verglas, payload: { playerId: Verglas }) => {
		ws.to(gameId).emit("message", JSON.stringify({ method: "s2c-timeUp", ...payload }));
	},
};
const c2s: { [key: string]: (socket: io.Socket, payload: any) => void } = {
	updateProfile: (
		socket: io.Socket,
		payload: { clientId: Verglas; profile: PlayerProfile | undefined }
	) => {
		if (!clients[payload.clientId]) return;
		clients[payload.clientId].player.profile = {
			name: payload.profile?.name.substring(0, 16) ?? "Анонимус",
			pfp: payload.profile?.pfp ?? defaultPfpUrl + payload.profile?.name,
		};
	},

	createRoom: (socket: io.Socket, payload: { clientId: Verglas }) => {
		const client = clients[payload.clientId];
		if (!client) return;
		const gameId = verglas.next();
		const code = crypto.randomBytes(3).toString("hex");
		const game: Game = (games[gameId] = {
			id: gameId,
			code,
			state: { type: "lobby", playersReady: 0 },
			solo: false,
			playerCount: 1,
			players: { [payload.clientId]: client.player },
		});
		if (client.gameId) {
			s2c.playerLeft(client.gameId, { playerId: client.player.id });
		}
		client.gameId = gameId;
		s2c.createdRoom(socket, { game });
	},

	joinRoom: (socket: io.Socket, payload: { clientId: Verglas; code: string }) => {
		const client = clients[payload.clientId];
		if (!client) return;
		const code = payload.code;
		const game = Object.values(games).find(game => game.code === code);
		if (game) {
			if (client.gameId) {
				s2c.playerLeft(client.gameId, { playerId: client.player.id });
			}
			client.gameId = game.id;
			game.playerCount++;
			game.solo = false;
			game.players[payload.clientId] = client.player;
			s2c.playerJoined(game.id, { player: client.player });
			s2c.joinedRoom(socket, { game });
		} else s2c.joinedRoom(socket, { error: 404 });
	},

	leaveRoom: (socket: io.Socket, payload: { clientId: Verglas }) => {
		const client = clients[payload.clientId];
		if (!client?.gameId) return;
		const game = games[client.gameId];
		if (!game) return;
		socket.leave(client.gameId);
		s2c.playerLeft(client.gameId, { playerId: client.player.id });
		client.gameId = undefined;
	},

	unreadyToGame: (socket: io.Socket, payload: { clientId: Verglas }) => {
		const client = clients[payload.clientId];
		if (!client?.gameId || client.player.state !== "ready") return;
		const game = games[client.gameId];
		if (game.state.type !== "lobby") return;

		game.state.playersReady--;
		client.player.state = "lobby";
		s2c.updateGame(game);
	},
	readyToGame: (socket: io.Socket, payload: { clientId: Verglas }) => {
		const client = clients[payload.clientId];
		if (!client?.gameId || client.player.state !== "lobby") return;
		const game = games[client.gameId];
		if (game.state.type !== "lobby") return;

		game.state.playersReady++;
		client.player.state = "ready";
		if (game.state.playersReady === game.playerCount) {
			game.state = { type: "starting" };
			console.log(`Game ${game.id} starting`);
			setTimeout(() => {
				gamesData[game.id] = { notPlayedPlayers: [] };
				game.solo = game.playerCount === 1;
				game.state = {
					type: "playing",
					currentPart: "",
					currentPlayer: "",
					difficulty: 1,
					qi: -1,
					round: -1,
					time: -1,
				};
				newState(game);
				s2c.updateGame(game);
			}, 3000);
		}
		s2c.updateGame(game);
	},

	typing: (socket: io.Socket, payload: { clientId: Verglas; typing: string }) => {
		const client = clients[payload.clientId];
		if (!client?.gameId || client.player.state !== "current") return;
		client.player.typing = payload.typing;
		s2c.typing(client.gameId, { playerId: client.player.id, typing: payload.typing });
	},
	answer: (socket: io.Socket, payload: { clientId: Verglas; answer: string }) => {
		const client = clients[payload.clientId];
		if (!client?.gameId || client.player.state !== "current") return;
		const game = games[client.gameId];

		const correct =
			payload.answer.includes(game.state.currentPart) && doesWordExist(payload.answer);
		client.player.typing = payload.answer;
		s2c.answer(client.gameId, { playerId: client.player.id, answer: payload.answer, correct });
		if (correct) {
			newState(game);
			s2c.updateGame(game);
		} else {
			client.player.incorrectGuesses++;
		}
	},
};

server.listen(8081);
console.log("Live on http://localhost:8081");

const readLineAsync = () => {
	const rl = readline.createInterface({
		input: process.stdin,
	});

	return new Promise(resolve => {
		rl.prompt();
		rl.on("line", line => {
			rl.close();
			console.log(
				line === "/games"
					? games
					: line === "/clients"
					? Object.values(clients).map(function (client) {
							return { ...client, socket: client.socket.id };
					  })
					: "Commands: /games, /clients"
			);
			resolve(readLineAsync());
		});
	});
};
readLineAsync();
