import { Socket, io } from "socket.io-client";
import { Verglas } from "./verglas";
import m from "mithril";

import { Game, Player, PlayerProfile } from "./server/app";
import { disableKeyboard, enableKeyboard, gameStartWindow, joinWindow, playfield } from ".";
import { keyboard } from "./objects";
const defaultPfpUrl = "/rpfp/";

let socket: Socket;
export let clientId: Verglas;
export const profile: PlayerProfile = {
	name: "Анонимус",
	pfp: defaultPfpUrl,
};
// @ts-ignore
export let game: Game = {};

export function player(): Player {
	return game.players[clientId];
}
export function players(): { [key: Verglas]: Player } {
	return game.players;
}

let lastTyping = 0;
let queuedTyping = false;
function typing() {
	if (game?.state?.currentPlayer !== clientId) return;
	player().typing = keyboard.value;
	m.redraw();
	const now = Date.now();
	if (now - lastTyping < 500) {
		if (!queuedTyping) {
			queuedTyping = true;
			setTimeout(() => {
				queuedTyping = false;
				typing();
			}, now - lastTyping);
		}
		return;
	}
	lastTyping = now;
	c2s.typing(socket, { clientId, typing: keyboard.value });
}
function answer(e: KeyboardEvent) {
	if (game?.state?.currentPlayer !== clientId) return;
	if (e.key !== "Enter") return;
	e.preventDefault();
	c2s.answer(socket, {
		clientId,
		answer: keyboard.value.toLowerCase().replace("ё", "е").replace(" ", ""),
	});
}

export function connect(url: string | null = null) {
	if (url) socket = io(url);
	else socket = io();
	socket.on("message", (message: string) => {
		const payload = JSON.parse(message);

		const [type, func] = (payload.method as string).split("-");
		if (type === "s2c") {
			if (func !== "typing") console.log(payload);
			if (!Object.keys(s2c).includes(func)) return;
			s2c[func as keyof typeof s2c](socket, payload);
		}
	});
	socket.on("disconnect", () => {
		console.log("disconnected");
		leaveGame(false);
	});
}

export function leaveGame(showJoinWindow: boolean = true) {
	if (!game?.id) return;
	playfield.clearPlayers();
	gameStartWindow.hide();
	c2s.leaveRoom(socket, { clientId });
	keyboard.removeEventListener("input", typing);
	keyboard.removeEventListener("keydown", answer);
	if (showJoinWindow) joinWindow.show();
	for (const key in game) {
		// @ts-ignore
		game[key] = undefined;
	}
}

export function joinGame(code: string | null = null) {
	if (!socket) return;
	profile.pfp = defaultPfpUrl + profile.name;
	c2s.updateProfile(socket, { clientId, profile });
	if (!code) {
		c2s.createRoom(socket, { clientId });
	} else {
		console.log(`Joining game with code ${code}`);
		c2s.joinRoom(socket, { clientId, code });
	}
}
export function readyToGame() {
	c2s.readyToGame(socket, { clientId });
}
export function unreadyToGame() {
	c2s.unreadyToGame(socket, { clientId });
}

// networking

const s2c: { [key: string]: (socket: Socket, payload: any) => void } = {
	connect: (socket: Socket, payload: { clientId: Verglas }) => {
		clientId = payload.clientId;
		joinWindow.show();
	},
	createdRoom: (socket: Socket, payload: { game: Game }) => {
		Object.assign(game, payload.game);
		playfield.updatePlayers();
		joinWindow.hide();
		gameStartWindow.show();
	},
	joinedRoom: (socket: Socket, payload: { game: Game; error?: number }) => {
		if (payload.error) {
			return console.error(payload.error);
		}
		Object.assign(game, payload.game);
		playfield.updatePlayers();
		joinWindow.hide();
		gameStartWindow.show();
	},
	playerJoined: (socket: Socket, payload: { player: Player }) => {
		game.playerCount++;
		game.players[payload.player.id] = payload.player;
		playfield.updatePlayers();
	},
	playerLeft: (socket: Socket, payload: { playerId: Verglas }) => {
		game.playerCount--;
		delete game.players[payload.playerId];
		playfield.removePlayer(payload.playerId);
	},

	updateGame: (socket: Socket, payload: { game: Game }) => {
		Object.assign(game, payload.game);
		if (game.state.type === "starting") {
			gameStartWindow.hide();
			playfield.countdown();
			keyboard.addEventListener("input", typing);
			keyboard.addEventListener("keydown", answer);
		}
		if (game.state.type === "playing") {
			if (game.state.currentPlayer === clientId) {
				console.log("your turn");
				enableKeyboard();
			} else {
				disableKeyboard();
			}
		}
		m.redraw();
	},

	typing: (socket: Socket, payload: { playerId: Verglas; typing: string }) => {
		if (payload.playerId === clientId) return;
		game.players[payload.playerId].typing = payload.typing;
		m.redraw();
	},
	answer: (socket: Socket, payload: { playerId: Verglas; answer: string; correct: boolean }) => {
		if (payload.playerId !== clientId) game.players[payload.playerId].typing = payload.answer;
		if (payload.correct) {
			if (payload.playerId === clientId) {
				disableKeyboard();
			}
		} else {
			game.players[payload.playerId].incorrectGuesses++;
		}
		m.redraw();
	},
};
const c2s: { [key: string]: (socket: Socket, payload: any) => void } = {
	updateProfile: (
		socket: Socket,
		payload: { clientId: Verglas; profile: PlayerProfile | undefined }
	) => {
		socket.send(JSON.stringify({ method: "c2s-updateProfile", ...payload }));
	},

	createRoom: (socket: Socket, payload: { clientId: Verglas }) => {
		socket.send(JSON.stringify({ method: "c2s-createRoom", ...payload }));
	},
	joinRoom: (socket: Socket, payload: { clientId: Verglas; code: string }) => {
		socket.send(JSON.stringify({ method: "c2s-joinRoom", ...payload }));
	},
	leaveRoom: (socket: Socket, payload: { clientId: Verglas }) => {
		socket.send(JSON.stringify({ method: "c2s-leaveRoom", ...payload }));
	},

	unreadyToGame: (socket: Socket, payload: { clientId: Verglas }) => {
		socket.send(JSON.stringify({ method: "c2s-unreadyToGame", ...payload }));
	},
	readyToGame: (socket: Socket, payload: { clientId: Verglas }) => {
		socket.send(JSON.stringify({ method: "c2s-readyToGame", ...payload }));
	},

	typing: (socket: Socket, payload: { clientId: Verglas; typing: string }) => {
		socket.send(JSON.stringify({ method: "c2s-typing", ...payload }));
	},
	answer: (socket: Socket, payload: { clientId: Verglas; answer: string }) => {
		socket.send(JSON.stringify({ method: "c2s-answer", ...payload }));
	},
};
