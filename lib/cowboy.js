import joyful from '@momsfriendlydevco/joyful';

/**
* Wrap an incoming Wrangler request
*
* - JSON bodies are decoded automatically and provided as `body`
*
* @param {Object} req Cloudflare request object to react to
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Object|Set} [options.allow] Settings for incoming request allowage
* @param {String|Array<String>} [options.allow.methods=['GET']] HTTP methods to accept, all others are rejected
* @param {Function|Object} [options.query] Any valid Joyful query to validate incoming query parameters
* @param {Function|Object} [options.body] Any valid Joyful query to validate incoming body parameters
* @param {Object} [options.headers] Key/val headers to inject in EVERY request, usually pretains to CORS overhead
*
* @returns {Promise} A promise which resolves when the operation has completed of the form `({body:Object})`
*/
export default async function cowboy(req, options) {
	let settings = {
		allow: {
			method: new Set(['GET']),
			query: null,
			body: null,
		},
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': '*',
			'Content-Type': 'application/json;charset=UTF-8',
		},
		...options,
	};

	// Options processing {{{
	// Cast settings.allow.method to Set
	settings.allow.method = settings.allow.method instanceof Set
			? settings.allow.method
			: new Set(settings.allow.method);
	// }}}

	// Compose universal response parameters {{{
	let baseResponse = {
		headers: {
			...settings.headers,
		},
	};
	// }}}

	// Inject headers + exit if CORS probe {{{
	if (req.method == 'OPTIONS' && !settings.allow.method.has('OPTIONS')) { // Deal with CORS probes (if we dont already allow OPTIONS method)
		return new Response('ok', baseResponse);
	}
	// }}}

	// Validation 1.1 - Check method against allowed set {{{
	if (!settings.allow.method.has(req.method)) {
		return new Response(`Method "${req.method}" not allowed`, {
			status: 400,
			...baseResponse,
		});
	}
	// }}}

	// Validation 1.2 - Check URL query against joi {{{
	if (settings.allow.body) {
		let joyfulResult = joyful(body, settings.allow.body, {throw: false});
		if (joyfulResult !== true) { // Failed body validation?
			return new Response(joyfulResult, {
				status: 400,
				...baseResponse,
			});
		}
	}
	// }}}

	let body = req.method != 'GET' ? await req.json() : {};

	// Validation 1.3 - If non-GET method - check body against Joi {{{
	if (req.method != 'GET' && settings.allow.body) {
		let joyfulResult = joyful(body, settings.allow.body, {throw: false});
		if (joyfulResult !== true) { // Failed body validation?
			return new Response(joyfulResult, {
				status: 400,
				...baseResponse,
			});
		}
	}
	// }}}
}
