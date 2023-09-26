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
*
* @returns {Promise} A promise which resolves when the operation has completed
*/
export function start(options) {
	let settings = {
		axios: null,
		logPreamble: false,
		logOutput: output => console.log('WRANGLER>', output),
		logOutputErr: output => console.log('WRANGLER!', output),
		host: '127.0.0.1',
		port: 8787,
		logLevel: 'log',
		...options,
	};

	debug('Start cowboy testkit wrapper');
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
			debug('Running Wrangler against script', wranglerConfig.main);

			let isRunning = false;
			return new Promise((resolve, reject) => {
				worker = spawn('node', [
					'./node_modules/.bin/wrangler',
					'dev',
					`--host=${settings.host}`,
					`--port=${settings.port}`,
					`--log-level=${settings.logLevel}`,
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

				worker.on('close', code => {
					debug('Wrangler exited with code', code);
					worker = null;
				})
			});
		})
		.then(devWorker => worker = devWorker)
		// }}}
		// .then(()=> new Promise(resolve => setTimeout(resolve, 10 * 1000)))
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
* @returns {Promise} A promise which resolves when the operation has completed
*/
export function stop() {
	debug('Stop cowboy testkit wrapper');
	return Promise.resolve()
		// Stop wrangler worker (if any) {{{
		.then(()=> {
			if (!worker) return;
			debug('Stopping active Wrangler worker');
			return worker.stop();
		})
		// }}}
}

/**
* Inject various Mocha before/after tooling
* @param {Object} [options] Additional options to pass to `start()`
*/
export function cowboyMocha(options) {

	before('start cowboy/testkit', function() {
		this.timeout(30 * 1000);
		return start(options);
	});

	after('stop cowboy/testkit', stop);

}

export default {
	cowboyMocha,
	stop,
	start,
};
