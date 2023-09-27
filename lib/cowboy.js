import debug from '#lib/debug';
import CowboyMiddleware from '#middleware';
import CowboyRequest from '#lib/request';
import CowboyResponse from '#lib/response';

export class Cowboy {
	/**
	* @name CowboyMiddleware
	* @description An instance of a middleware item
	* @type {Function|String|Array<String,Object>} Either a compiled function factory, pointer to a known CowboyMiddleware entity or Record(name, options) pair
	*/

	/**
	* @name CoyboyRoute
	* @description A Cowboy Route entity
	* @type {Object}
	* @property {Array<String>} methods Methods to accept (each is an upper case HTTP method)
	* @property {Array<String|RegExp>} paths Path matchers to accept
	* @property {Array<CowboyMiddleware>} [middleware] Middleware / resolvers to use for the route, should it match
	*/

	/**
	* List of middleware which will be called on all matching routes
	* @type Array<CowboyMiddleware>
	*/
	earlyMiddleware = [];


	/**
	* List of routes which will be examined in order until a match occurs
	* @type {Array<CowboyRoute>}
	*/
	routes = [];


	/**
	* Queue up a middleware path
	* All given middleware is called in sequence, if middleware
	*
	* @param {String|Array<String>} methods A method matcher or array of available methods
	* @param {String|RegExp|Array<String|RegExp>} paths A prefix path to match
	* @param {CowboyMiddleware} middleware... Middleware to call in sequence
	*
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	route(methods, paths, ...middleware) {
		this.routes.push({
			methods: Array.isArray(methods) ? methods : [methods],
			paths: Array.isArray(paths) ? paths : [paths],
			middleware,
		})
		return this;
	}


	/**
	* Prepend middleware which will be used for all routes
	* @param {CowboyMiddleware} middleware Middleware to use
	*/
	use(...middleware) {
		this.earlyMiddleware.push(middleware);
		return this;
	}


	/**
	* Get the route to use when passed a prototype request
	* @param {CowboyRequest} req The incoming request to match
	* @returns {CowboyRoute} The matching route to use, if any
	*/
	resolve(req) {
		return this.routes.find(route =>
			route.methods.includes(req.method) // Method matches
			&& route.paths.some(path => // Path matches
				typeof path == 'string' ? req.path == path
				: path instanceof RegExp ? path.test(req.path)
				: (()=> { throw new Error('Path is not a String or RegExp') })()
			)
		);
	}


	/**
	* Action an incoming route by resolving + walking down its middleware chain
	* @param {CloudflareRequest} req The incoming request
	* @param {Object} [env] Optional environment passed from Cloudflare
	* @returns {Promise<CowboyResponse>} A promise which will eventually resolve when all middleware completes
	*/
	async fetch(cfReq, env) {
		if (env.COWBOY_DEBUG) {
			debug.enabled = true;
			debug('Cowboy Worker debugging is enabled');
		}

		// Create basic [req]uest / [res]ponse objects
		let req = new CowboyRequest(cfReq, {router: this});
		let res = new CowboyResponse();

		// Exec all earlyMiddleware - every time
		await this.execMiddleware({req, res, middleware: this.earlyMiddleware});

		// Find matching route
		let route = this.resolve(req);
		if (!route) {
			if (debug.enabled) {
				debug(`No matching route for "${req.method} ${req.path}"`);
				this.routes.forEach((r, i) =>
					debug(
						`Route #${i}`,
						r.methods.length == 1 ? r.methods[0] : r.methods.join('|'),
						r.paths.length == 1 ? r.paths[0] : r.paths.join('|'),
					)
				);
			}
			return res.sendStatus(404).toCloudflareResponse(); // No matching route
		}

		// Exec route middleware
		let response = await this.execMiddleware({req, res, middleware: route.middleware});

		if (!response) throw new Error('Middleware chain ended without returning a response!');
		if (!response.toCloudflareResponse) throw new Error('Eventual middleware chain output should have a .toCloudflareResponse() method');
		return response.toCloudflareResponse();
	}


	async execMiddleware({middleware, req, res}) {
		let middlewareStack = [...middleware] // Shallow copy middleware stack to execute
			.map(m => {
				let mFunc =
					typeof m == 'function' ? m // Already a function
					: typeof m == 'string' ? CowboyMiddleware[m]() // Lookup from middleware with defaults
					: Array.isArray(m) ? CowboyMiddleware[m[0]](m[1]) // Lookup from middleware with options
					: (()=> { throw new Error(`Unknown middleware type "${typeof m}"`) })()

				if (!mFunc) throw new Error('Cowboy Middleware must be a function, string or Record(name, options)');
				return mFunc;
			});

		let response; // Response to eventually send
		while (middlewareStack.length > 0) {
			let middleware = middlewareStack.shift();
			response = await middleware(req, res);
			if (response?.hasSent) { // Stop middleware chain as some intermediate has signalled the chain should end
				response = res;
				break;
			} else if (response && !(response instanceof CowboyResponse) && middlewareStack.length == 0) { // Last item in middleware chain returned something but it doesn't look like a regular response - wrap it
				response = res.end(response);
			}
		}
		return response;
	}


	// Alias functions to route
	delete(path, ...middleware) { return this.route('DELETE', path, ...middleware) }
	get(path, ...middleware) { return this.route('GET', path, ...middleware) }
	head(path, ...middleware) { return this.route('HEAD', path, ...middleware) }
	post(path, ...middleware) { return this.route('POST', path, ...middleware) }
	put(path, ...middleware) { return this.route('PUT', path, ...middleware) }
	options(path, ...middleware) { return this.route('OPTIONS', path, ...middleware) }
}


/**
* Wrap an incoming Wrangler request
* @returns {Object} A Wrangler compatible object
*/
export default function cowboy(options) {
	let cowboyInstance = new Cowboy(options);

	// Utterly ridiculous fix to subclass 'fetch' as a POJO function as Wrangler seems to only check hasOwnProperty for the fetch method
	Object.assign(cowboyInstance, {
		fetch: cowboyInstance.fetch.bind(cowboyInstance),
	});

	return cowboyInstance;
}