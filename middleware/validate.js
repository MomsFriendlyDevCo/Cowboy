import joyful from '@momsfriendlydevco/joyful';

/**
* Run a Joi / Joyful validation function against a specific subkey within `req
*
* @param {String} subkey The subkey to run against
* @param {Function|Object} Callback to use with Joyful to validate with
* @returns {Void} Either a successful middleware cycle (if validation succeeds) or a call to `res.status(400)` if failed
*/
export default function CowboyMiddlewareValidate(subkey, validator) {
	return (req, res) => {
		let joyfulResult = joyful(req[subkey], validator);

		if (joyfulResult !== true) { // Failed body validation?
			return res
				.status(400)
				.send(joyfulResult)
		}
	}
}
