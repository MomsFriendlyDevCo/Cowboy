/**
* Return a parsing middleware layer which accepts a JWT body and decodes the object into req.body
*
* @param {Object} [options] Additional options to mutate behaviour
* @param {Function} [options.isJwt] Async function, called as `(req, res)` to determine if the input is a JWT payload, defaults to checking the content-type header
*/
export default function CowboyMiddlewareParseJwt(options) {
	let settings = {
		async isJwt(req, res) { // eslint-disable-line no-unused-vars
			return req.headers['content-type'] == 'application/jwt';
		},
		...options,
	};

	return async (req, res) => {
		if (await !settings.isJwt(req, res)) return;

		const base64 = req.text.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		req.body = JSON.parse(atob(base64));
	}
}
