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
	* @property {Boolean|'VAR'} scheduler Add a generic `/__scheduled` endpoint to execute any queued scheduler. If value is `'VAR'` this will only apply if the env `COWBOY_SCHEDULER` is set and truthy
	* @property {Function} pathTidy Additional tidyup for server request paths, useful if the API does not live at the server root. Defaults to removing a "/api/:worker/" prefix
	*/
	settings = {
		scheduler: 'VAR',
		pathTidy(path) {
			return path
				.replace(/^\/api\/\w+/, '/')
				.replace(/^\/+/, '/') // Trim excessive forward slashes
		},
	};


	/**
	* List of middleware which will be called on all matching routes
	* @type {Array<CowboyMiddleware>}
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
	* @param {String|Array<String>} methods A method matcher or array of available methods in upper-case
	* @param {String|RegExp|Array<String|RegExp>} paths A prefix path to match
	* @param {CowboyMiddleware...} middleware Middleware to call in sequence
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
	*
	* @param {CloudflareRequest} cfReq The incoming request
	* @param {Object} [env] Optional environment passed from Cloudflare
	* @returns {Promise<CowboyResponse>} A promise which will eventually resolve when all middleware completes
	*/
	async fetch(cfReq, env) {
		this.init();

		if (env.COWBOY_DEBUG)
			debug.enabled = true;

		if ( // Setup scheduler endpoint if this is the first fetch() hit were we can access the `env` state
			!this._schedulerSetup
			&& (
				this.settings.scheduler === true
				|| (
					this.settings.scheduler == 'VAR'
					&& env.COWBOY_SCHEDULER
				)
			)
		) {
			console.log('Scheduler setup against /__scheduled');
			this._schedulerSetup = true;

			// Find first GET operation
			let routeIndex = this.routes.findIndex(r => r.methods.some(m => m == 'GET'));
			if (routeIndex < 0) routeIndex = this.routes.length; // If no GETS, assume end position

			// Splice into position before first GET
			let matcher = compileRoutePaths('/__scheduled');
			this.routes.splice(routeIndex, 0, {
				methods: ['GET'],
				paths: matcher.paths,
				matcher,
				middleware: [
					async (req, res, env) => {
						debug('Executing schedule handler');
						if (!this.schedule.handler) return res.status(404).send('No scheduler installed');

						try {
							let result = await this.schedule.handler.call(
								this,
								{ // Faked Cloudflare `controller` context
									cron: 'FAKE',
									type: 'scheduled',
									scheduledTime: (new Date()).toISOString(),
								},
								env,
								{ // Faked Cloudflare `ctx` context - we provide a fake waitUntil here
									waitUntil() {
										throw new Error('ctx.waitUntil() functionality is provided natively by Cowboy.schedule(cb:Function) - just return a promise instead of using it');
									},
								},
							);
							debug('Got scheduler response', result);
							return res.send(result);
						} catch (e) {
							return res.status(400).send(`Scheduler threw error: ${e.toString()}`);
						}
					},
				]
			});
		}


		// Create basic [req]uest / [res]ponse objects
		let req = new CowboyRequest(cfReq, {
			router: this,
			pathTidy: this.settings.pathTidy,
		});
		req.cowboy = this;

		await req.parseBody();

		let res = new CowboyResponse();
		res.cowboy = this;
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
			return await res.sendStatus(404).toCloudflareResponse(req); // No matching route
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
		return await response.toCloudflareResponse(req);
	}


	/**
	* Call a router function as if it were invoked directly
	* This function exists as an easier way to remap body contents without
	*
	* @param {String} url The URL path to call
	* @param {Object} options Additional request options
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
				let errorText =
					!e ? 'An unknown error has occured'
					: typeof e == 'string' ? e
					: e instanceof Error ? e.toString().replace(/^Error: /, '')
					: e.error && typeof e.error == 'string' ? e.error
					: e.err && typeof e.err == 'string' ? e.err
					: e?.data && typeof e.data == 'string' ? e.data
					: e?.data?.errmsg && typeof e.data.errmsg == 'string' ? e.data.errmsg
					: e?.data?.error && typeof e.data.error == 'string' ? e.data.error
					: e?.data?.err && typeof e.data.err == 'string' ? e.data.err
					: e?.data?.statusText && typeof e.data.statusText == 'string' ? e.data.statusText
					: e?.status === -1 ? 'Server connection failed'
					: typeof e == 'function' && e.toString() !== '[object Object]' ? e.toString()
					: e?.code && e?.message && typeof e.code == 'string' && typeof e.message == 'string' ? `${e.code}: ${e.message}` // Supabase error objects
					: 'An unknown error has occured';

				if (res?.afterErrorCallbacks?.length > 0) {
					await Array.fromAsync(res.afterErrorCallbacks, cb =>
						cb(req, res, e)
					);
				} else {
					console.warn('Cowboy caught unhandled error', e);
				}

				debug('Extracted error text digest', {errorText});

				// Form: '404: Not found'
				if (/^(\d{3}):/.test(errorText)) {
					let errorBits = /^(?<status>\d{3}):?(?<text>.*)$/.exec(errorText).groups;
					res.status(errorBits.status).send(errorBits.text);
				} else { // Generic error code - assume 400
					res.status(400).send(errorText);
				}

				response = res;
				break;
			}
		}
		return response;
	}


	// Alias functions to route
	all(path, ...middleware) { return this.route(['DELETE', 'GET', 'PATCH', 'POST', 'PUT'], path, ...middleware) }
	delete(path, ...middleware) { return this.route('DELETE', path, ...middleware) }
	get(path, ...middleware) { return this.route('GET', path, ...middleware) }
	head(path, ...middleware) { return this.route('HEAD', path, ...middleware) }
	patch(path, ...middleware) { return this.route('PATCH', path, ...middleware) }
	post(path, ...middleware) { return this.route('POST', path, ...middleware) }
	put(path, ...middleware) { return this.route('PUT', path, ...middleware) }
	options(path, ...middleware) { return this.route('OPTIONS', path, ...middleware) }


	/**
	* Handle cron job scheduling
	*
	* @param {Function} handler The callback to install for all scheduled events. Called as `(event:CloudflareEvent, env:Object, ctx:CloudflareContext)`
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	schedule(handler) {
		debug('Installed schedule event handler');
		this.schedule.handler = handler;
		return this;
	}


	/**
	* Set up Cloudflare response to "scheduled" call
	* This is really just a map to the last handler we installed to .schedule(cb) - for now
	*
	* @param {CloudflareEvent} event The Cloudflare event context passed
	* @param {Object} env Environment variables
	* @param {CloudflareContext} ctx The Cloudflare context to respond to
	*
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	scheduled(event, env, ctx) {
		if (!this.schedule.handler) throw new Error('Attemped to access Cowboy.scheduled without first calling .schedule() to set something up!');

		// Wrap all scheduler calls in ctx.waitUntil() so promises are always waited on
		ctx.waitUntil(
			this.schedule.handler.call(
				this,
				event,
				env,
				{
					waitUntil() {
						throw new Error('ctx.waitUntil() functionality is provided natively by Cowboy.schedule(cb:Function) - just return a promise instead of using it');
					},
				},
			)
		);

		return this;
	}


	/**
	* Generial Init() sequence
	* This will be run automatically on setup or the first fetch()
	* @returns {Cowboy} This chainable Cowboy router instance
	*/
	init() {
		if (this.doneInit) return this; // Already completed init
		debug('INIT!');

		return this;
	}
}


/**
* Wrap an incoming Wrangler request
*
* @param {Object} [options] Additional initalization options to use in the Constructor
*
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
