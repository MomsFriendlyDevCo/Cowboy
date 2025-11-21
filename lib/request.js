import debug from '#lib/debug';

/**
* Tiny wrapper around Wrangler to wrap its default Request object in an Express-like structure
* @augments {CloudflareRequest}
*/
export default class CowboyRequest {

	/**
	* The original Cloudflare Request object
	* @type {CloudflareRequest}
	*/
	cfReq;


	/**
	* Extracted request path with leading slash
	* @type {String}
	*/
	path;


	/**
	* Extracted hostname being addressed
	*/
	hostname;


	/**
	* Extracted URL query parameters
	* @type {Object}
	*/
	query = {};


	/**
	* Raw body payload provided by cfReq
	* This gets translated into a usable object after a call to `parseBody()`
	* @type {Buffer}
	*/
	text = null;


	/**
	* Body payload provided by cfReq (
	* Defaults to the same value as `text` until its parsed by `parseBody()`
	* @type {*}
	*/
	body = null;


	constructor(cfReq, props) {
		this.cfReq = cfReq;

		// Copy all cfReq keys locally as a shallow copy
		Object.assign(
			this,
			Object.fromEntries(
				Object.keys(Request.prototype).map(key =>
					[
						key,
						cfReq[key],
					]
				)
			),
			props,
		);

		// Break appart the incoming URL
		let url = new URL(cfReq.url);
		this.path = this.pathTidy(url.pathname);
		this.hostname = url.hostname;
		this.query = Object.fromEntries(url.searchParams);

		this.routePath = ''; // Eventually matching routePath segment
		this.params = {}; // Set empty object for path extraction

		// Slurp the headers
		this.headers = Object.fromEntries(cfReq.headers.entries());

		// Hold the raw data
		this.text = cfReq.text.bind(cfReq),

		// Hold the body element - this wont be decoded until parseBody() is called
		this.body = {
			json: cfReq.json.bind(cfReq),
			formData: cfReq.formData.bind(cfReq),
			text: cfReq.text.bind(cfReq),
		};
	}


	/**
	* Parse the body of an incoming request
	*
	* @param {String} [forceType] Whether to force a specific mime-type instead of using the header supplied format
	* @returns {Promise} A promise which will resolve when the body has been parsed
	*/
	async parseBody(forceType) {
		let type = (forceType || this.headers['content-type'] || '')
			.replace(/^([a-z\-\/]+).*$/, '$1'); // Scrap everything after the mime

		switch (type) {
			case 'json':
			case 'application/json':
				if (this.headers['content-length'] == 0) { // Sending JSON but its blank
					this.body = {};
				} else { // Try to decode JSON in a wrapper
					try {
						this.body = await this.body.json();
					} catch (e) {
						if (debug.enabled) debug('Failed to decode request body as JSON:', e.toString());
						throw new Error('Invalid JSON body');
					}
				}
				break;
			case 'formData':
			case 'multipart/form-data': // Decode as multi-part
			case 'application/x-www-form-urlencoded': // Decode as multi-part
				try {
					let formData = await this.body.formData();
					this.body = Object.fromEntries(formData.entries());
				} catch (e) {
					if (debug.enabled) debug('Failed to decode multi-part body:', e.toString());
					throw new Error('Invalid multi-part encoded body');
				}
				break;
			case 'text':
			case 'text/plain': // Decode as plain text
				try {
					this.body = await this.body.text();
				} catch (e) {
					if (debug.enabled) debug('Failed to decode plain-text body:', e.toString());
					throw new Error('Invalid text body');
				}
				break;
			default:
				debug('Empty Body Payload - assuming raw payload');
				this.text = await this.body.text();
				this.body = {};
		}
	}


	/**
	* Utility function to simplify an incoming request
	* @returns {String} Human readable string
	*/
	toString() {
		return `${this.method} ${this.path}`;
	}
}
