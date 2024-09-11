import CowboyMiddlewareValidate from '#middleware/validate';

export default function CowboyMiddlewareValidateHeaders(validator) {
	return CowboyMiddlewareValidate('headers', validator);
}
