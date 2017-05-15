const http = require("http");
const http2 = require("http2");
const url = require("url");
const fs = require("fs");
const minify = require("html-minifier").minify;
const zlib = require("zlib");

let config = require("./Config.js");

const cache = [{
	path: "",
	content: fs.readFileSync(config.Site.FilePath, "utf8"),
	content_type: "text/html",
	status_code: 503,
	length: 0,
	content_gzip: null,
	content_gzip_length: 0,
	content_deflate: null,
	content_deflatelength: 0
}];

if (fileExists("./favicon.ico", fs.constants.R_OK)) {
	cache.push({
		path: "favicon.ico",
		content: fs.readFileSync("./favicon.ico", "utf8"),
		content_type: "image/x-icon",
		status_code: 200
	});
}

class Server {
	start() {
		if (config.Server.HttpPort === null && config.Server.HttpsPort === null) {
			process.exit(1);
		}

		if (config.Server.HttpPort != null) {
			http.createServer(Server.onRequest).listen(config.Server.HttpPort);
		}

		if (config.Server.HttpsPort != null) {
			config.Server.HttpsOptions.cert = fs.readFileSync(config.Server.HttpsOptions.cert);
			config.Server.HttpsOptions.key = fs.readFileSync(config.Server.HttpsOptions.key);
			http2.createServer(config.Server.HttpsOptions, Server.onRequest).listen(config.Server.HttpsPort);
		}
	}

	static onRequest(request, response) {
		request.queryPath = url.parse(request.url).path;
		if (Server.handleCachedRequests(request, response)) {
			return;
		}

		if (request.queryPath !== "/") {
			Server.sendResponse(request, response, {
				status_code: 307,
				content: "<html><head><title>307 Temporary Redirect</title><meta charset=\"UTF-8\"></head><body bgcolor=\"white\"><center><h1>307 Temporary Redirect</h1></center><hr></body></html>",
				content_type: "text/html"
			});
			return;
		}

		return;
	}

	/**
	 * @static
	 * @param {http.IncomingMessage} request
	 * @param {http.ServerResponse} response
	 * @param {any} element
	 * @memberof Server
	 */
	static sendResponse(request, response, element) {
		Server.updateElementContent(element);
		let data = Server.handleAcceptEncoding(request, response, element);

		response.setHeader("Content-Type", element.content_type || "text/plain");

		if (element.status_code === 307) {
			response.setHeader("Location", "/");

			if (config.Server.KeepAliveOn3xx) {
				response.setHeader("Connection", "Keep-Alive");
			} else {
				response.setHeader("Connection", "Keep-Alive");
			}
		} else {
			if (config.Server.KeepAlive) {
				response.setHeader("Connection", "Keep-Alive");
			} else {
				response.setHeader("Connection", "Close");
			}
		}

		config.Site.CustomHttpHeaders.forEach(e => {
			if (e.IsDefault) {
				e.Headers.forEach(header => {
					response.setHeader(header.Key, header.Value);
				});
			}

			if (e.Code === element.status_code) {
				e.Headers.forEach(header => {
					response.setHeader(header.Key, header.Value);
				});
			}
		});

		response.writeHead(element.status_code || 500);
		response.end(data || "");
		return;
	}

	/**
	 * @static
	 * @param {http.IncomingMessage} request
	 * @param {http.ServerResponse} response
	 * @param {any} element
	 * @returns {any} response body
	 * @memberof Server
	 */
	static handleAcceptEncoding(request, response, element) {
		/** @type {any} */
		let data;

		if (request.headers["accept-encoding"]) { // if accept-encoding
			if (request.headers["accept-encoding"].match(/\bgzip\b/)) { // if accepting gzip
				if (element.content_gzip && element.content_gzip_length > 0) { // if has gzip
					response.setHeader("Vary", "Accept-Encoding");
					response.setHeader("Content-Encoding", "gzip");
					response.setHeader("Content-Length", element.content_gzip_length);
					data = element.content_gzip;
				} else { // if NOT has gzip
					response.setHeader("Content-Length", element.length);
					data = element.content;
				}
			} else if (request.headers["accept-encoding"].match(/\bdeflate\b/)) { // if accepting deflate
				if (element.content_deflate && element.content_deflate_length > 0) { // if has deflate
					response.setHeader("Vary", "Accept-Encoding");
					response.setHeader("Content-Encoding", "deflate");
					response.setHeader("Content-Length", element.content_deflate_length);
					data = element.content_deflate;
				} else { // if NOT has deflate
					response.setHeader("Content-Length", element.length);
					data = element.content;
				}
			} else { // if NOT accepting gzip AND NOT accepting deflate
				response.setHeader("Content-Length", element.length);
				data = element.content;
			}
		} else { // if NOT accept-encoding
			response.setHeader("Content-Length", element.length);
			data = element.content;
		}

		return data;
	}

	static updateElementContent(element) {
		if (config.Site.MinifyHtml && element.content_type.toLowerCase() === "text/html") {
			element.content = minify(element.content, {
				minifyCSS: true,
				minifyJS: true,
				quoteCharacter: "\"",
				removeComments: false,
				removeEmptyAttributes: true,
				useShortDoctype: true,
				collapseWhitespace: true,
				collapseInlineTagWhitespace: false,
				caseSensitive: true,
				decodeEntities: true,
				ignoreCustomComments: [/.*/]
			});
		}

		const contentBuffer = new Buffer(element.content);
		element.length = Buffer.byteLength(element.content, "utf8");

		if (config.Server.SupportGzipCompression) {
			element.content_gzip = zlib.gzipSync(contentBuffer, { level: zlib.Z_BEST_COMPRESSION, memLevel: 9, flush: zlib.Z_NO_FLUSH });
			element.content_gzip_length = Buffer.byteLength(element.content_gzip);
		}

		if (config.Server.SupportDeflateCompression) {
			element.content_deflate = zlib.deflateSync(contentBuffer, { level: zlib.Z_BEST_COMPRESSION, memLevel: 9, flush: zlib.Z_NO_FLUSH });
			element.content_deflate_length = Buffer.byteLength(element.content_deflate);
		}
	}

	/**
	 * @static
	 * @param {http.IncomingMessage} request
	 * @param {http.ServerResponse} response
	 * @returns {bool} responseIsSend
	 * @memberof Server
	 */
	static handleCachedRequests(request, response) {
		let responseIsSend = false;

		cache.forEach(element => {
			if (request.queryPath === `/${element.path}`) {
				Server.sendResponse(request, response, element);
				responseIsSend = true;
			}
		});

		return responseIsSend;
	}
}

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

cache.forEach(element => {
	Server.updateElementContent(element);
});

module.exports = Server;
