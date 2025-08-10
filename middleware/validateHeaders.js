import CowboyMiddlewareValidate from '#middleware/validate';

/**
* Shorthand middleware to apply validation to the headers (`req.headers`) object
*
* @param {Function|Object} validator Callback to use with Joyful to validate with
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareValidateHeaders(validator) {
	return CowboyMiddlewareValidate('headers', validator);
}
