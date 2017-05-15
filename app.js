require("use-strict");
const fs = require("fs");
const fsExtra = require("fs-extra");
const os = require("os");
const cluster = require("cluster");

/**
 * @param {string} filePath
 * @param {number=fs.constants.F_OK} mode
 * @returns {boolean}
 */
function fileExists(filePath, mode = fs.constants.F_OK) {
	try {
		fs.accessSync(filePath, mode);
		return true;
	} catch (e) {
		return false;
	}
}

if (!fileExists("./Config.js")) {
	fsExtra.copySync("./Config.example.js", "./Config.js");
}

let config = require("./Config.js");
const Server = require("./Server.js");
const server = new Server();

if (process.env.NODE_ENV === "development" || !config.Server.UseMultipleProcessingCores) {
	server.start();
} else {
	if (cluster.isMaster) {
		if (config.Server.MaxProcessingCores < 1) {
			config.Server.MaxProcessingCores = os.cpus().length;
		}

		for (let i = config.Server.MaxProcessingCores; i > 0; i--) {
			cluster.fork();
		}

		cluster.on("exit", (worker, code, signal) => {
			// eslint-disable-next-line no-console
			console.error(`worker #${worker.id} (pid ${worker.process.pid}) died (returned code ${code || "undefined"}; signal ${signal || "undefined"}). restarting...`);
			process.exit(1);
		});
	} else if (cluster.isWorker) {
		server.start();
	}
}
