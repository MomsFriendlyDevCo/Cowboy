import CowboyMiddlewareValidate from '#middleware/validate';

/**
* Shorthand middleware to apply validation to the query (`req.query`) object
*
* @param {Function|Object} validator Callback to use with Joyful to validate with
* @returns {CowboyMiddleware}
*/
export default function CowboyMiddlewareValidateQuery(validator) {
	return CowboyMiddlewareValidate('query', validator);
}
