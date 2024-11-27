import debug from '#lib/debug';
import CowboyMiddleware from '#middleware';
import CowboyRequest from '#lib/request';
import CowboyResponse from '#lib/response';
import {compile as compileRoutePaths} from '@momsfriendlydevco/path-match';

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
	* General settings for this Cowboy instance
	*
	* @type {Object}
	* @property {Function} pathTidy Additional tidyup for server request paths, useful if the API does not live at the server root. Defaults to removing a "/api/:worker/" prefix
	*/
	settings = {
		patchAxios: true,
		pathTidy(path) {
			return path
				.replace(/^\/api\/\w+/, '/')
				.replace(/^\/+/, '/') // Trim excessive forward slashes
		},
	};


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
	* Has completed one init() cycle
	* @type {Boolean}
	*/
	doneInit = false;


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
		let matcher = compileRoutePaths(paths);
		this.routes.push({
			methods: Array.isArray(methods) ? methods : [methods],
			paths: matcher.paths,
			matcher,
			middleware,
		})

		return this;
	}


	/**
	* Prepend middleware which will be used for all routes
	* @param {CowboyMiddleware...} middleware Middleware(s) to use
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	use(...middleware) {
		this.earlyMiddleware.push(...middleware);
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
			&& route.matcher.isMatch(req.path)
		);
	}


	/**
	* Action an incoming route by resolving + walking down its middleware chain
	* @param {CloudflareRequest} req The incoming request
	* @param {Object} [env] Optional environment passed from Cloudflare
	* @returns {Promise<CowboyResponse>} A promise which will eventually resolve when all middleware completes
	*/
	async fetch(cfReq, env) {
		this.init();

		if (env.COWBOY_DEBUG)
			debug.enabled = true;

		// Create basic [req]uest / [res]ponse objects
		let req = new CowboyRequest(cfReq, {
			router: this,
			pathTidy: this.settings.pathTidy,
		});

		await req.parseBody();

		let res = new CowboyResponse();
		debug('Incoming request:', req.toString());

		// Exec all earlyMiddleware - every time
		await this.execMiddleware({
			req, res, env,
			middleware: this.earlyMiddleware,
		});

		// Find matching route
		let route = this.resolve(req);
		if (!route) {
			if (debug.enabled) {
				debug(`No matching route for "${req.toString()}"`);
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

		// Populate params
		let firstPathIndex = route.paths.findIndex(re => re.test(req.path));
		req.params = route.paths[firstPathIndex].exec(req.path)?.groups;

		// Exec route middleware
		let response = await this.execMiddleware({
			req, res, env,
			middleware: route.middleware,
		});

		if (!response) throw new Error('Middleware chain ended without returning a response!');
		if (!response.toCloudflareResponse) throw new Error('Eventual middleware chain output should have a .toCloudflareResponse() method');
		return response.toCloudflareResponse();
	}


	/**
	* Call a router function as if it were invoked directly
	* This function exists as an easier way to remap body contents without
	*
	* @param {String} url The URL path to call
	* @param {Object} request Additional request options
	* @param {Object} env The environment object to use
	*
	* @returns {CloudflareResponse} The returned CloudflareResponse object
	*/
	async proxy(url, options, env) {
		if (!url || !options || !env) throw new Error('Url + options + env must be specified to proxy()');

		return this.fetch(new Request(new URL(url, 'http://localhost').toString(), {
			...options,
			body: (()=> {
				if ( // Being handed a native Cloudflare request body?
					!options.body
					|| options.body instanceof FormData
					|| options.body instanceof ReadableStream
					|| options.body instanceof URLSearchParams
					|| typeof options.body == 'string'
				) {
					return options.body;
				} else if (typeof options.body == 'object') { // Convert POJO into Formdata
					let body = new FormData();
					Object.entries(options.body)
						.forEach(([key, val]) => body.append(key, val))
					return body;
				}
			})(),
		}), env);
	}


	async execMiddleware({middleware, req, res, env}) {
		let middlewareStack = middleware
			.map(m => {
				let mFunc =
					typeof m == 'function' ? m // Already a function
					: typeof m == 'string' ? CowboyMiddleware[m].apply(this) // Lookup from middleware with defaults
					: Array.isArray(m) ? CowboyMiddleware[m[0]].apply(this, m.slice(1)) // Lookup from middleware with options
					: (()=> { throw new Error(`Unknown middleware type "${typeof m}"`) })()

				if (!mFunc) throw new Error('Cowboy Middleware must be a function, string or Record(name, options)');
				return mFunc;
			});

		let response; // Response to eventually send
		while (middlewareStack.length > 0) {
			let middleware = middlewareStack.shift();
			try {
				response = await middleware.call(this, req, res, env);
				if (response?.hasSent) { // Stop middleware chain as some intermediate has signalled the chain should end
					response = res;
					break;
				} else if (response && !(response instanceof CowboyResponse) && middlewareStack.length == 0) { // Last item in middleware chain returned something but it doesn't look like a regular response - wrap it
					response = res.end(response);
				}
			} catch (e) {
				let errorText = typeof e == 'string' ? e : e.toString();

				debug('Error thrown', e);

				// Form: '404: Not found'
				if (/^(\d{3}):/.test(errorText)) {
					let errorBits = /^(?<status>\d{3}):?(?<text>.*)$/.exec(errorText).groups;
					res.status(errorBits.status).send(errorBits.text);
				} else { // Generic error - assume 400
					res.status(400).send(e.toString());
				}

				response = res;
				break;
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


	/**
	* Generial Init() sequence
	* This will be run automatically on setup or the first fetch()
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	init() {
		debug('INIT!');
		if (this.doneInit) return this; // Already completed init

		if (this.settings.patchAxios) {
			// TODO: Patch Axios somehow
			// axios.defaults.adapter = axiosFetchAdapter;
		}
		return this;
	}
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

	cowboyInstance.init();

	return cowboyInstance;
}
