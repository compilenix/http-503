module.exports = {
	Server: {
		UseMultipleProcessingCores: true,
		MaxProcessingCores: 0, // set to 0 for all cores
		HttpPort: 80, // set to null to disable
		HttpsPort: null, // set to null to disable
		HttpsOptions: {
			key: "./privkey.pem",
			cert: "./fullchain.pem"
		},
		KeepAlive: false,
		KeepAliveOn3xx: true,
		SupportGzipCompression: true,
		SupportDeflateCompression: true
	},
	Site: {
		FilePath: "./maintenance.html",
		MinifyHtml: true,
		CustomHttpHeaders: [
			{
				IsDefault: true, // this will be set on all responses
				Code: null,
				Headers: [
					{ Key: "X-Content-Type-Options", Value: "nosniff" },
					{ Key: "X-Frame-Options", Value: "SAMEORIGIN" }
				]
			},
			{
				Code: 503,
				Headers: [
					{ Key: "Retry-After", Value: 120 } // seconds or http-date. see also: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
				]
			}
		]
	}
};
