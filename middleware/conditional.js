/**
* Register a generic middleware to selectively include other middleware
* This middleware takes a single callback, which, if satisifed then chains any other middleware functions
*
* @param {Object} options Additional options to mutate behaviour
* @param {Function} options.when Async callback to run as `(req:Object, res:Object, env:Object)`, if this returns truthy the middleware defined in `options.include` is executed otherwise `options.otherwise` is used
* @param {*} [options.include] Other middleware to include or invoke if the callback is satisified
* @param {*} [options.otherwise] Other middleware to include or invoke if the callback is NOT satisified
* @param {Boolean} [options.debug=false] Verbose debugging
*
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareConditional(options) {
	let settings = {
		when: null,
		include: null,
		otherwise: null,
		debug: false,
		...options,
	};
	if (!settings.when) throw new Error('No condtitionally.when:Function specified');

	return (req, res, env) => {
		if (settings.debug) console.log('[Cowboy/Conditional middleware] Do conditional include!', {settings});

		return Promise.resolve()
			.then(()=> settings.when(req, res, env))
			.then(shouldInclude => {
				if (settings.debug) console.log('[Cowboy/Conditional middleware] Callback result', {shouldInclude});

				let middleware = shouldInclude ? settings.include : settings.otherwise;

				if (settings.debug) console.log('[Cowboy/Conditional middleware] Will run middleware result', {middleware});

				if (middleware) return this.use(middleware);
			})
	}
}
