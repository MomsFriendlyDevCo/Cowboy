@MomsfriendlyDevCo/Cowboy
=========================
A friendler wrapper around the Cloudflare [Wrangler SDK](https://github.com/cloudflare/workers-sdk)

Features:

* Automatic CORS handling
* Basic router support
* Express-like `req` + `res` object for routes
* Built in middleware + request validation via [Joi](https://joi.dev)
* Built-in debug support for testkits + Wrangler
* Built-in JSON / Multipart (or FormData) / Plain text decoding and population of `req.body`
* Scheduled tasks can return promises and they are automatically awaited (no need to do `ctx.waitUntil()`)


Examples
========

Simple request output
---------------------
Example `src/worker.js` file providing a GET server which generates random company profiles:

```javascript
import {faker} from '@faker-js/faker';
import cowboy from '@momsfriendlydevco/cowboy';

export default cowboy()
	.use('cors') // Inject CORS functionality in every request
	.get('/', ()=> ({
		name: faker.company.name(),
		motto: faker.company.catchPhrase(),
	}))
```



ReST server example
-------------------
Example `src/worker.js` file providing a GET / POST ReST-like server:

```javascript
import cowboy from '@momsfriendlydevco/cowboy';

export default cowboy()
	.use('cors')
	.get('/widgets', ()=> // Fetch a list of widgets
		widgetStore.fetchAll()
	)
	.post('/widgets', async (req, res, env) => { // Create a new widget
		let newWidget = await widgetStore.create(req.body);
		res.send({id: newWidget.id}); // Explicitly send response
	})
	.get('/widgets/:id', // Validate params + fetch an existing widget
		['validateParams', joi => ({ // Use the 'validateParams' middleware with options
			id: joi.number().required().above(10000).below(99999),
		})],
		req => widgetStore.fetch(req.params.id),
	)
	.delete('/widgets/:id', // Try to delete a widget
		(req, res, env) => { // Apply custom middleware
			let isAllowed = await widgetStore.userIsValid(req.headers.auth);
			if (!isAllowed) return res.sendStatus(403); // Stop bad actors
		},
		req => widgetStore.delete(req.params.id)
	)
};


Cron schedule handling
----------------------
Cron scheduling is a little basic at the moment but likely to improve in the future.
To set up a Cron handler simply install it by calling `.schedule(callback)`:

```javascript
import cowboy from '@momsfriendlydevco/cowboy';

export default cowboy()
	.schedule(async (event, env, ctx) => {
		// Handle cron code here
	})
```
```

Debugging
---------
This module uses the [Debug NPM](https://github.com/visionmedia/debug#readme). To enable simply set the `DEBUG` environment variable to include `cowboy`.

Debugging workers in Testkits will automatically detect this token and enable debugging there. Use the `debug` export within Testkits to see output.



API
===

cowboy()
--------
```javascript
import cowboy from '@momsfriendlydevco/cowboy';
```
Instanciate a `Cowboy` class instance and provide a simple router skeleton.


Cowboy
------
```javascript
import {Cowboy} from '@momsfriendlydevco/cowboy';
```
The instance created by `cowboy()`.


Cowboy.delete(path) / .get() / .head() / .post() / .put() / .options()
----------------------------------------------------------------------
Queue up a route with a given path.

Each component is made up of a path + any number of middleware handlers.

```javascript
let router = new Cowboy()
	.get('/my/path', middleware1, middleware2...)
```

Notes:
* All middleware items are called in sequence - and are async waited-on)
* If any middleware functions fail the entire chain aborts with an error
* All middleware functions are called as `(CowboyRequest, CowboyResponse, Env)`
* If any middleware functions call `res.end()` (or any of its automatic methods like `res.send()` / `res.sendStatus()`) the chain also aborts successfully
* If the last middleware function returns a non response object - i.e. the function didn't call `res.send()` its assumed to be a valid output and is automatically wrapped


Cowboy.use(middleware)
----------------------
Queue up a universal middleware handler which will be used on *all* endpoints.
Middleware is called as per `Cowboy.get()` and its equivelents.


Cowboy.resolve(CowboyRequest)
-----------------------------
Find the matching route that would be used if given a prototype request.


Cowboy.fetch(CloudflareRequest, CloudflareEnv)
----------------------------------------------
Execute the router when given various Cloudflare inputs.

This function will, in order:

1. Enable debugging if required
2. Create `(req:CowboyRequest, res:CowboyResponse)`
3. Execute all middleware setup via `Cowboy.use()`
4. Find a matching route - if no route is found, raise a 404 and quit
5. Execute the matching route middleware, in sequence
6. Return the final response - if it the function did not already explicitly do so


Cowboy.proxy(path, request, env)
--------------------------------
Forward from one route to another as if the second route was called first.


Cowboy.schedule(callback)
-------------------------
Install a scheduled Cron handler function.


CowboyRequest
-------------
```javascript
import CowboyRequest from '@momsfriendlydevco/cowboy/request';
```
A wrapped version of the incoming `CloudflareRequest` object.

This object is identical to the original [CloudflareRequest](https://developers.cloudflare.com/workers/runtime-apis/request/#properties) object with the following additions:

| Property   | Type     | Description                                              |
|------------|----------|----------------------------------------------------------|
| `path`     | `String` | Extracted `url.pathname` portion of the incoming request |
| `hostname` | `String` | Extracted `url.hostname` portion of the incoming request |


CowboyResponse
--------------
```javascript
import CowboyResponse from '@momsfriendlydevco/cowboy/request';
```
An Express-like response object.
Calling any method which ends the session will cause the middleware chain to terminate and the response to be served back.

This object contains various Express-like utility functions:

| Method                              | Description                                              |
|-------------------------------------|----------------------------------------------------------|
| `set(options)`                      | Set response output headers (using an object)            |
| `set(header, value)`                | Alternate method to set headers individually             |
| `send(data, end=true)`              | Set the output response and optionally end the session   |
| `end(data?, end=true)`              | Set the output response and optionally end the session   |
| `sendStatus(code, data?, end=true)` | Send a HTTP response code and optionally end the session |
| `status(code)`                      | Set the HTTP response code                               |
| `beforeServe(callback)`             | Queue a middleware callback before `toCloudflareResponse()` |
| `toCloudflareResponse()`            | Return the equivelent CloudflareResponse object          |

All functions (except `toCloudflareResponse()`) are chainable and return the original `CowboyResponse` instance.


CowboyTestkit
-------------
```javascript
import CowboyTestkit from '@momsfriendlydevco/cowboy/testkit';
```
A series of utilities to help write testkits with Wrangler + Cowboy.


CowboyTestkit.cowboyMocha()
---------------------------
Inject various Mocha before/after tooling.

```javascript
import axios from 'axios';
import {cowboyMocha} from '@momsfriendlydevco/cowboy/testkit';
import {expect} from 'chai';

describe('My Wrangler Endpoint', ()=> {

	// Inject Cowboy/mocha testkit handling
	cowboyMocha({
		axios,
	});

	let checkCors = headers => {
		expect(headers).to.be.an.instanceOf(axios.AxiosHeaders);
		expect(headers).to.have.property('access-control-allow-origin', '*');
		expect(headers).to.have.property('access-control-allow-methods', 'GET, POST, OPTIONS');
		expect(headers).to.have.property('access-control-allow-headers', '*');
		expect(headers).to.have.property('content-type', 'application/json;charset=UTF-8');
	};

	it('should expose CORS headers', ()=>
		axios('/', {
			method: 'OPTIONS',
		}).then(({data, headers}) => {
			expect(data).to.be.equal('ok');
			checkCors(headers);
		})
	);

	it('should do something useful', ()=>
		axios('/', {
			method: 'get',
		}).then(({data, headers}) => {
			checkCors(headers);

			// ... Your functionality checks ... //
		})
	);

});
```


CowboyTestkit.start(options)
----------------------------
Boot a wranger instance in the background and prepare for testing.
Returns a promise.

| Option         | Type       | Default       | Description                                               |
|----------------|------------|---------------|-----------------------------------------------------------|
| `axios`        | `Axios`    |               | Axios instance to mutate with the base URL, if specified  |
| `logOutput`    | `Function` |               | Function to wrap STDOUT output. Called as `(line:String)` |
| `logOutputErr` | `Function` |               | Function to wrap STDERR output. Called as `(line:String)` |
| `host`         | `String`   | `'127.0.0.1'` | Host to run Wrangler on                                   |
| `port`         | `String`   | `8787`        | Host to run Wrangler on                                   |
| `logLevel`     | `String`   | `'log'`       | Log level to instruct Wrangler to run as                  |


CowboyTestkit.stop()
--------------------
Terminate any running Wrangler background processes.


Middleware
==========
Cowboy ships with out-of-the-box middleware.
Middleware are simple functions which accept the paramters `(req:CowboyRequest, res:CowboyResponse)` and can modify the request, halt output with a call to `res` or perform other Async actions before continuing to the next middleware item.

To use middleware in your routes you can either declare it using `.use(middleware)` - which installs it globally or `.ROUTE(middleware...)` which installs it only for that route.

Middleware can be declared in the following ways:

```javascript
import cowboy from '@momsfriendlydevco/cowboy';

// Shorthand with defaults - just specify the name
cowboy()
	.get('/path',
		'cors',
		(req, res, env) => /* ... */
	)

// Name + options - specify an array with an optional options object
cowboy()
	.get('/path',
		['cors', {
			option1: value1,
			/* ... */
		}],
		(req, res, env) => /* ... */
	)


// Middleware function - include the import
import cors from '@momsfriendlydevco/cowboy/middleware/cors';
cowboy()
	.get('/path',
		cors({
			option1: value1,
			/* ... */
		}),
		(req, res, env) => /* ... */
	)
```


cors(options)
-------------
Inject simple CORS headers to allow websites to use the endpoint from the browser frontend.


devOnly()
---------
Allow access to the endpoint ONLY if Cloudflare is running in local development mode. Throws a 403 otherwise.


etagCaching(options)
--------------------
Return a `ETag` header with every response return 304 responses if the `If-None-Match` header is the same value.
This significantly reduces bandwidth if the same output result would be returned should the client include that header.


validate(key, validator)
------------------------
Validate the incoming `req.$KEY` object using [Joyful](https://github.com/MomsFriendlyDevCo/Joyful).
This function takes two arguments - the `req` subkey to examine and the validation function / object.

```javascript
import cowboy from '@momsfriendlydevco/cowboy';

// Shorthand with defaults - just specify the name
cowboy()
	.get('/path',
		['validate', 'body', joi => {
			widget: joi.string().required().valid('froody', 'doodad'),
			size: joi.number().optional(),
		})],
		(req, res, env) => /* ... */
	)
```

validateBody(validator)
-----------------------
Shorthand validator which runs validation on the `req.body` parameter only.


```javascript
import cowboy from '@momsfriendlydevco/cowboy';

// Shorthand with defaults - just specify the name
cowboy()
	.get('/path',
		['validateBody', joi => ({
			widget: joi.string().required().valid('froody', 'doodad'),
			size: joi.number().optional(),
		})],
		(req, res, env) => /* ... */
	)
```

validateHeaders(validator)
-----------------------
Shorthand validator which runs validation on the `req.headers` parameter only.


validateParams(validator)
-------------------------
Shorthand validator which runs validation on the `req.params` parameter only.


```javascript
import cowboy from '@momsfriendlydevco/cowboy';

// Shorthand with defaults - just specify the name
cowboy()
	.get('/widgets/:id',
		['validateParams', joi => {
			id: joi.string().required(),
		})],
		(req, res, env) => /* ... */
	)
```


validateQuery(validator)
------------------------
Shorthand validator which runs validation on the `req.query` parameter only.


```javascript
import cowboy from '@momsfriendlydevco/cowboy';

// Shorthand with defaults - just specify the name
cowboy()
	.get('/widgets/search',
		['validateQuery', joi => {
			q: joi.string().requried(),
		})],
		(req, res, env) => /* ... */
	)
```


parseJwt()
----------
Parse the incoming request as a JWT string and decode its contents into `req.body`.
