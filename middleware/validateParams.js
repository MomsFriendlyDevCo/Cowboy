import CowboyMiddlewareValidate from '#middleware/validate';

/**
* Shorthand middleware to apply validation to the parameters (`req.params`) object
*
* @param {Function|Object} validator Callback to use with Joyful to validate with
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareValidateParams(validator) {
	return CowboyMiddlewareValidate('params', validator);
}
