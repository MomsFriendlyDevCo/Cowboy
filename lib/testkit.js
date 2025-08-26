import Debug from 'debug';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import toml from 'toml';

const debug = Debug('cowboy');

/**
* The currently active worker (if any)
* @type {ChildProcess}
*/
export let worker;


/**
* Boot a wranger instance in the background
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Axios} [options.axios] Axios instance to mutate with the base URL, if specified
* @param {Boolean} [options.server=true] Initialize a local server - disable this if you're running your own
* @param {Boolean} [options.debug=false] Force debug as if `DEBUG=cowboy` was set
* @param {Boolean} [options.scheduler=false] Bind any scedhuler callback to `/__scheduled`
* @param {Function} [options.logOutput] Function to wrap STDOUT output. Called as `(line:String)`
* @param {Function} [options.logOutputErr] Function to wrap STDERR output. Called as `(line:String)`
* @param {String} [options.host='127.0.0.1'] Host to run Wrangler on
* @param {String} [options.port=8787] Host to run Wrangler on
* @param {String} [options.logLevel='log'] Log level to instruct Wrangler to run as
*
* @returns {Promise} A promise which resolves when the operation has completed
*/
export function start(options) {
	let settings = {
		axios: null,
		server: true,
		debug: false,
		scheduler: false,
		logOutput: output => console.log('WRANGLER>', output),
		logOutputErr: output => console.log('WRANGLER!', output),
		host: '127.0.0.1',
		port: 8787,
		logLevel: 'log',
		...options,
	};

	if (settings.debug) Debug.enable('cowboy');
	debug('Start cowboy testkit');
	let wranglerConfig; // Eventual wrangler config

	return Promise.resolve()
		// Read in project `wrangler.toml` {{{
		.then(()=> fs.readFile('wrangler.toml', 'utf8'))
		.then(contents => toml.parse(contents))
		.then(config => {
			debug('Read config', config);
			if (!Object.hasOwn(config, 'send_metrics')) throw new Error('Please append `send_metrics = false` to wrangler.toml to Warngler asking questions during boot');
			wranglerConfig = config;
		})
		// }}}
		// Launch worker {{{
		.then(()=> {
			if (!settings.server) return;
			debug('Running Wrangler against script', wranglerConfig.main);

			let isRunning = false;
			return new Promise((resolve, reject) => {
				worker = spawn('node', [
					'./node_modules/.bin/wrangler',
					'dev',
					`--host=${settings.host}`,
					`--port=${settings.port}`,
					`--log-level=${settings.logLevel}`,
					...(debug.enabled ? [
						'--var=COWBOY_DEBUG:1'
					]: []),
					...(settings.scheduler ? [
						'--var=COWBOY_SCHEDULER:1'
					]: []),
				]);

				worker.stdout.on('data', data => {
					let output = data.toString().replace(/\r?\n$/, '');

					if (!isRunning && /Ready on https?:\/\//.test(output)) {
						isRunning = true;
						resolve();
					}

					settings.logOutput(output);
				});

				worker.stderr.on('data', data => {
					settings.logOutputErr(data.toString().replace(/\r?\n$/, ''))
				});

				worker.on('error', reject);

				worker.on('close', code => {
					debug('Wrangler exited with code', code);
					worker = null;
				})
			});
		})
		// }}}
		// Mutate axios if provided {{{
		.then(()=> {
			if (settings.axios) {
				let baseURL = `http://${settings.host}:${settings.port}`;
				debug('Setting axios BaseURL', baseURL);
				settings.axios.defaults.baseURL = baseURL;
			}
		})
		// }}}
}

/**
* Stop background wrangler instances
*/
export function stop() {
	if (!worker) return; // Worker not active anyway
	debug('Stop cowboy testkit');

	debug(`Stopping active Wrangler worker PID #${worker.pid}`);
	worker.kill('SIGTERM');
}

/**
* Inject various Mocha before/after tooling
* @param {Object} [options] Additional options to pass to `start()`
*/
export function cowboyMocha(options) {

	// eslint-disable-next-line no-undef
	before('start cowboy/testkit', function() {
		this.timeout(30 * 1000);
		return start(options);
	});

	// eslint-disable-next-line no-undef
	after('stop cowboy/testkit', function() {
		this.timeout(5 * 1000);
		return stop();
	});

}

export default {
	cowboyMocha,
	stop,
	start,
};
