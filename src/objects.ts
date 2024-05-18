import m from "mithril";
import { Verglas } from "./verglas";

import icons from "./icons";
import { Player } from "./server/app";
import {
	clientId,
	game,
	joinGame,
	leaveGame,
	player,
	players,
	profile,
	readyToGame,
	unreadyToGame,
} from "./socket";

export function Node() {
	return {
		view: function (
			vnode: m.Vnode<
				{
					v?: "top" | "center" | "bottom";
					h?: "left" | "middle" | "right";
					flex?: boolean;
				} & m.Attributes,
				m.ChildArrayOrPrimitive
			>
		) {
			return m(
				".node",
				{
					class: `${vnode.attrs.v ?? "center"} 
							${vnode.attrs.h ?? "middle"} 
							${vnode.attrs.flex ? "flex" : ""}`,
					...vnode.attrs,
				},
				vnode.children
			);
		},
	};
}

function WindowHeader() {
	return {
		view: function (
			vnode: m.Vnode<{ icon?: m.Children; content?: m.Children } & m.Attributes, any>
		) {
			return m(
				".window-header",
				m(".window-header-icon", vnode.attrs.icon),
				m(".window-header-content", vnode.attrs.content)
			);
		},
	};
}
export class Window {
	protected isDragging = false;
	protected movementX = 0;
	protected movementY = 0;
	public options;

	constructor(
		public position: { width: number; height: number; x: number; y: number },
		options?: { zIndex?: number; icon?: m.Children; hidden?: boolean }
	) {
		this.options = {
			zIndex: 0,
			icon: icons.smile,
			hidden: false,
			...options,
		};
	}

	public goTo(x: number, y: number, speed = 1) {
		let prevTime = 0;
		return new Promise((resolve: (value: boolean) => void) => {
			const frame = (timestamp: number) => {
				if (!prevTime) prevTime = timestamp;
				const delta = (timestamp - prevTime) / 1000;

				const distance = Math.sqrt(
					Math.pow(x - this.position.x, 2) + Math.pow(y - this.position.y, 2)
				);
				this.position.x += (x - this.position.x) * (1 - Math.E ** (-speed * delta));
				this.position.y += (y - this.position.y) * (1 - Math.E ** (-speed * delta));
				if (distance < 1) {
					this.position.x = x;
					this.position.y = y;
					resolve(true);
				} else {
					requestAnimationFrame(frame);
				}
				m.redraw();
			};
			requestAnimationFrame(frame);
		});
	}

	public show() {
		this.options.hidden = false;
		m.redraw();
	}
	public hide() {
		this.options.hidden = true;
		m.redraw();
	}
	public view = (
		vnode: m.Vnode<{ header?: m.Children; content?: m.Children } & m.Attributes, any>
	) =>
		m(
			".window",
			{
				style: `width: ${this.position.width}px;
						height: calc(${this.position.height + 10}px + 1lh);
						left: calc(${this.position.x}% - ${this.position.width / 2}px);
						top: calc(${this.position.y}% - ${this.position.height / 2}px);
						z-index: ${this.options.zIndex};`,
				class: this.options.hidden ? "hidden" : "",
			},
			m(WindowHeader, { content: vnode.attrs.header, icon: this.options.icon }),
			m(".window-content", vnode.attrs.content)
		);
}

export class PlayerComponent {
	private position = { x: 50, y: 50 };

	constructor(public playerId: Verglas) {
		m.redraw();
	}

	public goTo(x: number, y: number, speed = 1) {
		let prevTime = 0;
		return new Promise((resolve: (value: boolean) => void) => {
			const frame = (timestamp: number) => {
				if (!prevTime) prevTime = timestamp;
				const delta = (timestamp - prevTime) / 1000;

				const distance = Math.sqrt(
					Math.pow(x - this.position.x, 2) + Math.pow(y - this.position.y, 2)
				);
				this.position.x += (x - this.position.x) * (1 - Math.E ** (-speed * delta));
				this.position.y += (y - this.position.y) * (1 - Math.E ** (-speed * delta));
				if (distance < 1) {
					this.position.x = x;
					this.position.y = y;
					resolve(true);
				} else {
					requestAnimationFrame(frame);
				}
				m.redraw();
			};
			requestAnimationFrame(frame);
		});
	}

	public view = () =>
		m(
			".player",
			{
				style: `left: ${this.position.x}%;
						top: ${this.position.y}%;`,
				class: `${game.players[this.playerId].id === clientId ? "you" : ""}
						${game.players[this.playerId].hp === 0 ? "dead" : ""}
						${game.state?.currentPlayer === game.players[this.playerId].id ? "current" : ""}`,
			},
			m(".player-hp", "".padStart(game.players[this.playerId].hp, "♥").padEnd(3, "♡")),
			m(".player-name", game.players[this.playerId].profile.name),
			m(".player-icon", m("img", { src: game.players[this.playerId].profile.pfp })),
			m(PlayerTypingComponent, { playerId: this.playerId })
		);
}

export let keyboard: HTMLInputElement;
function PlayerTypingComponent(initialVnode: m.Vnode<{ playerId: Verglas } & m.Attributes, any>) {
	let prevI: number = game.players[initialVnode.attrs.playerId].incorrectGuesses;
	let prevC: number = game.state.qi;
	return {
		view: (vnode: m.Vnode<{ playerId: Verglas } & m.Attributes, any>) =>
			m("input.player-text", {
				oncreate: function (vnodeDOM: m.VnodeDOM<any, any>) {
					if (vnode.attrs.playerId === clientId) {
						keyboard = vnodeDOM.dom as HTMLInputElement;
						console.log(keyboard);
					}
				},
				onupdate: function (vnodeDOM: m.VnodeDOM<any, any>) {
					const val = game.players[vnode.attrs.playerId].incorrectGuesses;
					if (game.state.type !== "playing") return;
					if (game.state.qi !== prevC) {
						prevC = game.state.qi;
						(vnodeDOM.dom as HTMLDivElement).classList.remove("correct");
						requestAnimationFrame(() => {
							(vnodeDOM.dom as HTMLDivElement).classList.add("correct");
						});
						if (game.solo)
							setTimeout(() => {
								game.players[vnode.attrs.playerId].typing = "";
								(vnodeDOM.dom as HTMLDivElement).classList.remove("correct");
								m.redraw();
							}, 1000);
					} else if (val !== prevI) {
						prevI = val;
						(vnodeDOM.dom as HTMLDivElement).classList.remove("incorrect");
						requestAnimationFrame(() => {
							(vnodeDOM.dom as HTMLDivElement).classList.add("incorrect");
						});
					}
				},
				disabled: vnode.attrs.playerId === clientId ? undefined : true,
				autocomplete: "off",
				class:
					`${
						game.players[vnode.attrs.playerId].typing &&
						game.players[vnode.attrs.playerId].state === "current"
							? "typing"
							: ""
					} ${game.players[vnode.attrs.playerId].state === "dead" ? "dead" : ""}` || "",
				value:
					vnode.attrs.playerId === clientId
						? vnode.attrs.value
						: game.players[vnode.attrs.playerId].typing,
			}),
	};
}

export class Playfield {
	private players: Verglas[] = [];
	private playerComponents: PlayerComponent[] = [];
	public gameWindow = new Window({ width: 120, height: 120, x: 50, y: 50 });
	private countdownComponent: typeof CountdownComponent | null = null;

	public clearPlayers() {
		this.players = [];
		this.playerComponents = [];
		m.redraw();
	}
	public removePlayer(playerId: Verglas) {
		this.players.splice(this.players.indexOf(playerId), 1);
		this.playerComponents = this.playerComponents.filter(p => p.playerId !== playerId);
		this.calculatePosition();
	}
	public updatePlayers() {
		Object.values(players()).forEach(player => {
			if (this.players.includes(player.id)) return;
			this.players.push(player.id);
			this.playerComponents.push(new PlayerComponent(player.id));
			m.redraw();
		});
		this.calculatePosition();
	}
	public countdown() {
		this.countdownComponent = CountdownComponent;
		const startTime = Date.now();
		const frame = () => {
			if (Date.now() - startTime > 3000) {
				this.countdownComponent = null;
				m.redraw();
			} else {
				m.redraw();
				requestAnimationFrame(frame);
			}
		};
		requestAnimationFrame(frame);
	}
	private calculatePosition() {
		this.playerComponents.forEach((player, i) => {
			const angle =
				((2 * Math.PI) / this.playerComponents.length) * i -
				(this.playerComponents.length === 1 ? Math.PI / 2 : Math.PI);
			const radius = 30;
			const centerX = radius * Math.cos(angle) + 50;
			const centerY = radius * Math.sin(angle) + 50;
			player.goTo(centerX, centerY);
		});
	}
	public view = () =>
		m(
			".playfield",
			this.playerComponents.map(p => m(p)),
			game.state.type === "lobby" || [
				m(this.gameWindow, {
					header:
						game.state.type === "starting"
							? "Готовы?"
							: `Раунд ${game.state.round + 1}`,
					content: this.countdownComponent
						? m(this.countdownComponent)
						: [
								m(TimerComponent, { duration: game.state.time }),
								m(Node, `- ${game.state.currentPart} -`),
						  ],
				}),
			]
		);
}
function TimerComponent() {
	let prevI: number = game.state.qi;
	return {
		onupdate: function (vnodeDOM: m.VnodeDOM<any, any>) {
			if (game.state.type !== "playing" || game.state.qi === prevI) return;
			prevI = game.state.qi;
			(vnodeDOM.dom as HTMLDivElement).classList.remove("animated");
			requestAnimationFrame(() => (vnodeDOM.dom as HTMLDivElement).classList.add("animated"));
		},
		view: function (vnode: m.Vnode<any, any>) {
			return m(".timer.animated", {
				style: `animation-duration: ${vnode.attrs.duration}ms`,
			});
		},
	};
}

export function JoinComponent() {
	let code: string;
	return {
		view: () => [
			m(
				Node,
				{ flex: true },
				m("input", {
					placeholder: "код",
					maxlength: 6,
					style: "width: 6em; text-align: center;",
					oninput: (e: KeyboardEvent) => (code = (e.target as HTMLInputElement).value),
				}),
				m(
					"button",
					{
						onclick: () => joinGame(code),
						style: "display: block; text-wrap: nowrap;",
					},
					code ? "Зайти" : "Создать комнату"
				)
			),
			m(
				Node,
				{ v: "bottom" },
				m("input", {
					placeholder: "имя в игре",
					maxlength: 16,
					oninput: (e: KeyboardEvent) =>
						(profile.name = (e.target as HTMLInputElement).value ?? "Анонимус"),
				})
			),
		],
	};
}

export function GameStartContentComponent() {
	let codeHidden = true;
	return {
		view: () => [
			m(
				Node,
				{ v: "top" },
				m(
					"div",
					"Код приглашения:",
					m("br"),
					m(
						"span.game-code",
						{
							onclick: () => (codeHidden = !codeHidden),
							class: codeHidden ? "hidden" : "",
						},
						codeHidden ? "кодтог" : game?.code
					),
					m(
						"button",
						{ onclick: () => navigator.clipboard.writeText(game.code) },
						icons.clipboard
					)
				)
			),
			m(
				Node,
				{ v: "bottom", flex: true },
				m(
					"button",
					{
						onclick: () =>
							player().state === "ready" ? unreadyToGame() : readyToGame(),
						class: player().state === "ready" ? "ready" : "",
					},
					"Начать"
				),
				m(".counter", `${game.state.playersReady}/${game.playerCount}`)
			),
			m(Node, { v: "top", h: "left" }, m("button", { onclick: () => leaveGame() }, icons.x)),
		],
	};
}

function CountdownComponent() {
	const startTime = Date.now();
	let elapsedTime = 0;
	return {
		onupdate: () => (elapsedTime = Date.now() - startTime),
		view: () =>
			m(
				Node,
				{ flex: true },
				m(
					".countdown",
					{
						style: `font-size: ${(elapsedTime % 1000) / 50 + 50}px;
								opacity: ${1 - ((elapsedTime % 1000) / 1000) ** 0.75}`,
					},
					Math.ceil(3 - elapsedTime / 1000)
				)
			),
	};
}

export const debugGameDataComponent = {
	view: () =>
		m(
			Node,
			{ v: "top", h: "left", style: "max-width: 60vw; word-wrap: anywhere;" },
			JSON.stringify(game, undefined, 2)
				.split("\n")
				.map((line: string) => m("pre", { style: `margin: 0; text-align: left` }, line))
		),
};
