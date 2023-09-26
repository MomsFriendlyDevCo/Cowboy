import Debug from 'debug';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import toml from 'toml';
import {unstable_dev as wranglerServer} from 'wrangler';

const debug = Debug('cowboy');

/**
* The currently active worker (if any)
* @type {WranglerInstance}
*/
export let worker;


/**
* Tail spawn instance (if any)
* @type {ChildProcess}
*/
export let tailProcess;


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
		log: true,
		logOutput: output => console.log('WRANGLER>', output),
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
			return wranglerServer(wranglerConfig.main, {
				experimental: {
					disableExperimentalWarning: true, // Don't complain the worker is experimental
				},
			})
		})
		.then(devWorker => worker = devWorker)
		// }}}
		.then(()=> new Promise(resolve => setTimeout(resolve, 10 * 1000)))
		// Watch logs (if settings.log) {{{
		.then(()=> {
			if (settings.log) {
				debug(`Booting 'wrangler tail ${wranglerConfig.name}'`);
				tailProcess = spawn('node', [
					'./node_modules/.bin/wrangler',
					'tail',
					wranglerConfig.name,
				])
					.on('data', data => settings.logOutput(data))
					.on('error', err => {
						console.warn("Error while running 'wrangler tail':", err);
					})
					.on('close', code => {
						debug('Wrangler tail exited with code', code);
						tailProcess = null;
					})
			}
		})
		// }}}
		// Mutate axios if provided {{{
		.then(()=> {
			if (settings.axios) {
				let baseURL = `http://${worker.address}:${worker.port}`;
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
