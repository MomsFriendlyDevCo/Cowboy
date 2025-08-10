import CowboyMiddlewareValidate from '#middleware/validate';

/**
* Shorthand middleware to apply validation to the request body (`req.body`) object
*
* @param {Function|Object} validator Callback to use with Joyful to validate with
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareValidateBody(validator) {
	return CowboyMiddlewareValidate('body', validator);
}
