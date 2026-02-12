/**
* APITally LogPush output support
* This middleware outputs a Base64 + Gziped trace for digest by the remote APITally.io service
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Boolean|Function} [options.enabled] Whether to perform an output action, defaults to being enabled only if we are likely running within a Cloudflare Co-location
* @param {String} [options.pathPrefix=''] Prefix to prepend to all endpoint paths
* @param {String} [options.client='js-serverless:hono'] The client string to use when reporting to APITally
* @param {String} [options.clientVersion] The client version string to use when reporting to APITally
* @param {Set<String>} [options.logMethods] Methods whitelist to use when computing the endpoints to APITally
*
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareApiTally(options) {
	let settings = {
		enabled(req, res) {
			return !! req.cfReq.cf?.colo; // Only run if we have a Cloudflare data center allocated - otherwise assume local execution
		},
		pathPrefix: '',
		client: 'js-serverless:hono',
		clientVersion: '1.0.0',
		logMethods: new Set([
			'DELETE',
			'GET',
			'PATCH',
			'POST',
			'PUT',
		]),
		...options,
	};

	let isFirstRequest = true;
	let instanceUuid;

	return (req, res) => {
		req.startTime = Date.now();

		/**
		* Main APITally handling function
		* This gets glued as `res.apiTallyOutput()`
		*
		* @param {CowboyRequest} req The request object to examine
		* @param {CowboyResponse} res The response object to examine
		* @param {Error} [err] Optional error content to include
		*/
		res.apiTallyOutput = async (req, res, err) => {
			if ( // Skip adding APITally output if we're not enabled
				!settings.enabled
				|| (
					typeof settings.enabled == 'function'
					&& !(await settings.enabled(req, res))
				)
			) return;

			if (!instanceUuid) { // We don't have an instanceUuid populated yet - compute one from the Cloudflare Ray ID
				instanceUuid = req.headers['cf-ray'].padStart(32, '0').slice(0, 32);
				instanceUuid = `${instanceUuid.slice(0, 8)}-${instanceUuid.slice(8, 12)}-${instanceUuid.slice(12, 16)}-${instanceUuid.slice(16, 20)}-${instanceUuid.slice(20, 32)}`;
			}

			/**
			* Actual output data structure to encode + output
			* This is copied from https://github.com/apitally/apitally-js-serverless/blob/main/src/hono/middleware.ts
			* @type {Object}
			*/
			let outputData = {
				instanceUuid,
				requestUuid: crypto.randomUUID(),
				consumer: undefined, // FIXME: No idea what this is but its optional anyway
				startup: isFirstRequest ? { // Compute + send paths for first session hit
					paths: res.cowboy.routes
						.flatMap(route =>
							route.methods
								.filter(method => settings.logMethods.has(method))
								.map(method =>
									route.matcher.pathStrings
										.filter(path => path.startsWith('/')) // Exclude complex RegEx matches
										.map(path => ({
											method,
											path: settings.pathPrefix + path,
										}))
								)
						),
					client: settings.client,
					versions: {
						'@apitally/serverless': settings.clientVersion,
					},
				} : undefined,
				request: {
					path: req.path,
					headers: Object.entries(req.headers),
					size: req.cfReq.headers.has('content-length') ? Number.parseInt(req.cfReq.headers.get('content-length')) : undefined,
					consumer: undefined, // FIXME: Where does this come from type is optional string
					body: bytesToBase64(pojoToUint8Array(req.body)),
				},
				response: {
					responseTime: Math.floor((Date.now() - req.startTime) / 1000),
					headers: Object.entries(res.headers),
					size:
						res.headers['Content-Type']?.startsWith('application/json') ? JSON.stringify(res.body)?.length ?? 0
						: res.headers['Content-Type']?.startsWith('text/')  && res.body?.length ? res.body.length
						: undefined,
					body:
						res.headers['Content-Type']?.startsWith('application/json') ? bytesToBase64(pojoToUint8Array(res.body))
						: res.headers['Content-Type']?.startsWith('text/') ? new TextEncoder().encode(res.body)
						: undefined,
				},
				validationErrors: undefined, // FIXME: Populate somehow, type is ValidationError[]
				exception: err ? { // Optionally splat error if we have one
					type: err.name,
					msg: err.message,
					stackTrace: err.stack ?? '',
				} : undefined,
			};

			// console.log('APITally data', JSON.stringify(outputData, null, '\t'));

			console.log('apitally:' + await gzipBase64(JSON.stringify(outputData)));
			isFirstRequest = false; // Disable need for more endpoint reporting after the first report
		};

		// Queue up callback function to call after handling the request
		res.beforeServe(async (req, res) => res.apiTallyOutput(req, res));
		res.afterError(async (req, res, err) => res.apiTallyOutput(req, res, err));
	};
}


// Utilify functions taken from source {{{

/**
* Convert a standard JS POJO into a Uint8Array type
*
* @param {Object|Array} obj Input object to work with
* @returns {Uint8Array} Output Uint8Array type
*/
function pojoToUint8Array(obj) {
	return new TextEncoder().encode(
		JSON.stringify(obj)
	);
}

/**
* Convert an incoming Uint8Array into Base64 encoding
*
* @see https://github.com/apitally/apitally-js-serverless/blob/main/src/common/bytes.ts
*
* @param {Uint8Array} bytes The incoming byte stream to convert
* @returns {String} Base64 Encoded content
*/
function bytesToBase64(bytes) {
	/* eslint-disable unicorn/numeric-separators-style, unicorn/prefer-code-point */
	const chunks = [];
	const chunkSize = 0x1000; // 4096 bytes
	for (let i = 0; i < bytes.length; i += chunkSize) {
		chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
	}
	return btoa(chunks.join(""));
}


/**
* Encode a given input string via Gzip
*
* @param {String} json The input string to encode
* @returns {Uint8Array} The encoded input
*/
async function gzipBase64(json) {
	const encoder = new TextEncoder();
	const gzipStream = new CompressionStream("gzip");
	const writer = gzipStream.writable.getWriter();
	writer.write(encoder.encode(json));
	writer.close();

	const compressed = await new Response(gzipStream.readable).arrayBuffer();
	return bytesToBase64(new Uint8Array(compressed));
}

// }}}
