// Utility: sortKeys(o) - Re-sort a JSON object so that keys are in a predictable order {{{
function sortKeys(o) {
	if (typeof o !== 'object' || o === null) return o;
	if (Array.isArray(o)) return o.map(sortKeys);
	return Object.keys(o)
		.sort()
		.reduce((acc, key) => {
			acc[key] = sortKeys(o[key]);
			return acc;
		}, {});
};
// }}}


/**
* Cowboy middleware which will return a 304 if the incoming eTag matches the hash of the last identical response
* If hitting the same endpoints over and over this can significantly improve response times
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Function} [options.enabled] Async function to determine if caching should be used. Defaults to truthy only if the request method is 'GET'. Called as `(req:CowboyRequest, settings:Object)` as early in the process as possible
* @param {Function} [options.payload] Async function to determine what to hash. Defaults to method+query+url+body. Called as `(req:CowboyRequest, res:CowboyResponse, settings:Object)` and expeceted to return a POJO or `false` to disable caching
* @param {TextEncoder} [options.textEncoder] The TextEncoder instance to use when encoding
* @param {Function} [options.hasher] Async hashing function, should accept a POJO and return a hash of some variety (defaults to sorting POJO keys and returning an SHA-256). Called as `(obj:Object, settings:Object)`
* @param {Boolean|Function} [options.debug=false] Enable debug verbosity while working. If true will be converted into a built-in, otherwise specify how debugging should be handled. Called as `(...msg:Any)`
*
* @returns {CowboyMiddleware} A CowboyMiddleware compatible function - this can be used on individual requests or globally
*/
export default function CowboyEtagCaching(options) {
	let settings = {
		enabled(req, settings) { // eslint-disable-line no-unused-vars
			return (req.method == 'GET');
		},
		payload(req, res, settings) { // eslint-disable-line no-unused-vars
			let payload = {
				method: req.method,
				query: req.query,
				url: req.path,
				body: res.body,
			};
			console.log(JSON.stringify({payload}, null, '\t'));
			return payload;
		},
		textEncoder: new TextEncoder(),
		async hasher(obj, settings) {
			let text = JSON.stringify(sortKeys(obj));
			let data = settings.textEncoder.encode(text);
			let hashBuffer = await crypto.subtle.digest('SHA-256', data);
			let hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		},
		debug: false,
		...options,
	};

	// Transform settings.debug into a callable
	settings.debug =
		!settings.debug ? ()=> {} // No-op if disabled
		: typeof settings.debug == 'function' ? settings.debug
		: settings.debug === true ? (...msg) => console.log('[CowboyCacheContent]', ...msg)
		: (()=> { throw new Error('Unknown CowboyEtagCaching.debug type') })()

	return async function(req, res) {
		let isEnabled = await settings.enabled(req, settings);

		if (!isEnabled) {
			settings.debug('Disabled for request', req.path);
			return;
		}

		settings.debug('Enabled for request', req.path);

		// Queue up interceptor before responding to handle the output
		res.beforeServe(async ()=> {
			if (typeof res.data == 'object') {
				settings.debug('Refusing to cache - res.data is not an object');
				return;
			}

			let payload = await settings.payload(req, res, settings);
			if (typeof payload != 'object') {
				settings.debug('Refusing to cache - payload() returned non-object');
				return;
			}

			settings.debug('Payload keys', Object.keys(payload));

			let hash = await settings.hasher(payload, settings);
			if (typeof hash != 'string') {
				settings.debug('Refusing to cache - hasher() returned non-string');
				return;
			}

			settings.debug('Using ETag hash', hash);
			res.set('ETag', `"${hash}"`);

			// Incoming hash matcher?
			if (req.headers['if-none-match']) {
				settings.debug('Incoming request has Headers[If-None-Match]:', req.headers['if-none-match']);
				let etagMatcher = new RegExp( // Compute ETag header matcher
					'^'
					+ '(?:W\/)?' // Cloudflare has a tendency to rewrite strong hashes to weak (`"abc"` -> `W/"abc"`)
					+ '"'
					+ hash // We're trusting that the hash is only alpha numeric, god help us
					+ '"'
					+ '$'
				);

				if (etagMatcher.test(req.headers['if-none-match'])) {
					settings.debug('Request has matching if-none-match header - send 304 response');
					res.sendStatus(304);
				} else {
					settings.debug('Request has NON-matching if-none-match header - send full response');
				}
			}
		});
	};
}
