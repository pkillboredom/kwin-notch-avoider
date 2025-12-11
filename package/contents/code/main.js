// Test code
// const registerCallback = (cb) => setTimeout(cb.bind(null, getDummyClient(), true), 1000);
// const getDummyClient = () => ({
// 	specialWindow: false,
// 	fullScreen: true,
// 	frameGeometry: { x: 0, y: 0, width: 3456, height: 2234 },
// 	geometryChanged: { connect: (cb) => setTimeout(cb.bind(null, this), 1000) },	
// });
// const workspace = {
// 	clientArea: () => ({ x: 0, y: 0, width: 3456, height: 2234 }),
// 	clientFullScreenSet: { connect: registerCallback },
// 	clientMaximizeSet: { connect: registerCallback },
// 	clientAdded: { connect: registerCallback },
// 	clientActivated: { connect: registerCallback },
// 	screenResized: { connect: registerCallback },
// 	activeClient: getDummyClient(),
// };
// const registerShortcut = (name, desc, shortcut, cb) => { };
// const KWin = {
// 	FullScreenArea: 0,
// };
// const readConfig = (key, defaultValue) => defaultValue;
// const callDBus = (service, path, iface, method, args) => { };

const getConfigWidth = () => readConfig("screenWidth", 3456);
const getConfigHeight = () => readConfig("screenHeight", 2234);
const getConfigNotchThickness = () => readConfig("notchThickness", 65);

const errorMargin = 1e-2;
let autohidden = true;

const isAreaRightScreen = (area) => {
	const screenRatio = getConfigWidth() / getConfigHeight();

	return Math.abs(area.width / area.height - screenRatio) < errorMargin;
}

const isRightScreen = (window) => {
	const area = workspace.clientArea(KWin.FullScreenArea, window);
	return isAreaRightScreen(area);
};

const getScale = (window) => {
	const area = workspace.clientArea(KWin.FullScreenArea, window);
	return area.width / getConfigWidth();
};

const getRealNotchThickness = (window) => {
	const notchThickness = getConfigNotchThickness();
	return Math.round(notchThickness * getScale(window));
}

const changeYPosIfNecessary = (window) => (() => {
	if (window.specialWindow || !isRightScreen(window)) return;

	const area = workspace.clientArea(KWin.FullScreenArea, window);
	if (window.frameGeometry.y !== area.y) return;

	const realNotchThickness = getRealNotchThickness(window);

	const newHeight = Math.min(window.frameGeometry.height, area.height - realNotchThickness);
	window.frameGeometry = { x: window.frameGeometry.x, y: area.y + realNotchThickness, width: window.frameGeometry.width, height: newHeight }
});

const callPlasmaScript = (plasmascript) => {
	callDBus("org.kde.plasmashell", "/PlasmaShell", "org.kde.PlasmaShell", "evaluateScript", plasmascript);
};

const getBasePlasmaScript = () => `
const errorMargin = ${errorMargin};
const originalScreenWidth = ${getConfigWidth()};
const originalScreenHeight = ${getConfigHeight()};
const notchThickness = ${getConfigNotchThickness()};

const screenRatio = originalScreenWidth / originalScreenHeight;
const isRightScreen = (screenId) => {
	const screen = screenGeometry(screenId);
	return Math.abs(screen.width / screen.height - screenRatio) < errorMargin;
}
const isTaskBar = (panel) => isRightScreen(panel.screen) && panel.location === "top" && panel.formFactor === "horizontal";
const panel = panels().find(isTaskBar);
`;

const updateTaskbarThickness = (thickness) => {
	const thicknessExpression = thickness ? thickness.toString() : "notchThickness * scale";
	const plasmaScript = `
${getBasePlasmaScript()}
const scale = screenGeometry(panel.screen).width / originalScreenWidth;
panel.height = ${thicknessExpression};
`;
	callPlasmaScript(plasmaScript);
};

const autoHideTaskBar = (autohide) => {
	if (autohidden === autohide) return;

	const hiding = autohide ? "autohide" : "none";
	const plasmaScript = `
${getBasePlasmaScript()}
panel.hiding = "${hiding}";
`;
	callPlasmaScript(plasmaScript);
	autohidden = autohide;
};

const connectClient = (window) => {
	const callback = changeYPosIfNecessary(window);
	window.clientGeometryChanged.connect(callback);
	window.fullScreenChanged.connect(() => {
		if (window.fullscreen){
			const area = workspace.clientArea(KWin.FullScreenArea, window);

			const realNotchThickness = getRealNotchThickness(window);

			window.frameGeometry = { x: area.x, y: area.y + realNotchThickness, width: area.width, height: area.height - realNotchThickness }
		}

		if (window.active)autoHideTaskBar(window.fullScreen);
	});
	window.maximizedChanged.connect(() => {
		if (height != area.height - realNotchThickness || window.specialWindow || !isRightScreen(window)) return;

		const area = workspace.clientArea(KWin.FullScreenArea, window);
		const realNotchThickness = getRealNotchThickness(window);

		window.frameGeometry = { x: window.frameGeometry.x, y: area.y + realNotchThickness, width: window.frameGeometry.width, height: area.height - realNotchThickness };
	})
	callback();
};

workspace.windowAdded.connect(connectClient);
workspace.windowList().forEach(connectClient);

workspace.windowActivated.connect((window) => {
	const autoHidePanel = isRightScreen(window) && window.fullScreen;
	autoHideTaskBar(autoHidePanel);
});

workspace.virtualScreenSizeChanged.connect((screenId) => {
	const area = workspace.clientArea(KWin.FullScreenArea, screenId, 0);
	if (!isAreaRightScreen(area)) return;

	const scale = area.width / getConfigWidth();
	const notchThickness = getConfigNotchThickness();
	const realNotchThickness = Math.round(notchThickness * scale);
	updateTaskbarThickness(realNotchThickness);

	workspace.windowList().forEach(changeYPosIfNecessary);
});

updateTaskbarThickness();
autoHideTaskBar(false);
