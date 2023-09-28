/**
* Tiny wrapper around Wrangler to wrap its default Request object in an Express-like structure
* @extends CloudflareRequest
*/
export default class CowboyRequest {
	/**
	* Extracted request path with leading slash
	* @type {String}
	*/
	path;


	/**
	* Extracted hostname being addressed
	*/
	hostname;


	constructor(cfReq, props) {
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
	}
}
