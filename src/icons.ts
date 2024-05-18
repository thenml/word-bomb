import m from "mithril";

function icon(svg: string) {
	return m(".icon", m.trust(svg));
}

export default {
	box: icon(require("../assets/box.svg")),
	chrome: icon(require("../assets/chrome.svg")),
	clipboard: icon(require("../assets/clipboard.svg")),
	command: icon(require("../assets/command.svg")),
	cpu: icon(require("../assets/cpu.svg")),
	image: icon(require("../assets/image.svg")),
	smile: icon(require("../assets/smile.svg")),
	x: icon(require("../assets/x.svg")),
};
