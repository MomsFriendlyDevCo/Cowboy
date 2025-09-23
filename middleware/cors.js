/**
* Register a generic middleware to handle CORS requests
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Boolean} [options.attachOptions=true] Automatically attach an `OPTIONS` method against all routes that don't already have one to pass the CORS pre-flight check
* @param {String} [options.origin='*'] Origin URL to allow
* @param {String} [options.headers='*'] Headers to allow
* @param {Array<String>} [options.methods=['GET','POST','OPTIONS']] Allowable HTTP methods to add CORS to
* @param {Boolean} [options.debug=false] Output what endpoints have had CORS automatically attached
*
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareCORS(options) {
	let settings = {
		attachOptions: true,
		origin: '*',
		headers: '*',
		methods: ['GET', 'POST', 'OPTIONS'],
		debug: false,
		...options,
	};

	return (req, res) => {
		// Always inject CORS headers
		res.set({
			'Access-Control-Allow-Origin': settings.origin,
			'Access-Control-Allow-Methods': settings.methods.join(', '),
			'Access-Control-Allow-Headers': settings.headers,
			'Content-Type': 'application/json;charset=UTF-8',
		});

		// Inject various OPTIONS endpoints for CORS pre-flight
		if (settings.attachOptions && !req.router.loadedCors) {
			req.router.routes
				.filter(route => !route.methods.includes('OPTIONS'))
				.forEach(route =>
					route.paths.forEach(path => {
						if (settings.debug) console.log('[Cowboy/CORS middleware] Attach CORS to', path);

						req.router.options(path, (req, res) =>
							res.sendStatus(200)
						)
					})
				);

			req.router.loadedCors = true; // Mark we've already done this so we don't keep tweaking the router
		}
	}
}
