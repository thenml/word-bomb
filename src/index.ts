import m from "mithril";

import { Window, Playfield, GameStartContentComponent, keyboard } from "./objects";
import { connect, game } from "./socket";
import { JoinComponent } from "./objects";

const main = document.getElementsByTagName("main")[0];
export function enableKeyboard() {
	keyboard.disabled = false;
	keyboard.value = "";
	keyboard.focus();
	document.addEventListener("click", () => keyboard.focus());
	m.redraw();
}
export function disableKeyboard() {
	keyboard.disabled = true;
	document.removeEventListener("click", () => keyboard.focus());
	m.redraw();
}

export const playfield = new Playfield();
export const joinWindow = new Window({ width: 300, height: 200, x: 50, y: 50 }, { hidden: true });
export const endWindow = new Window({ width: 300, height: 200, x: 50, y: 50 });
export const gameStartWindow = new Window(
	{ width: 300, height: 200, x: 50, y: 50 },
	{ hidden: true }
);

function App() {
	return {
		view: function () {
			return [
				m(joinWindow, { header: "Зайти в игру", content: m(JoinComponent) }),
				//m(debugGameDataComponent),
				!game?.id || [
					m(playfield),
					game.state.type !== "lobby" ||
						m(gameStartWindow, {
							header: "word-bomb",
							content: m(GameStartContentComponent),
						}),
				],
			];
		},
	};
}
connect();

m.mount(main, App);
