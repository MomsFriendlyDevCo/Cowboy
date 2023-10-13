import CowboyMiddlewareValidate from '#middleware/validate';

export default function CowboyMiddlewareValidateParams(validator) {
	return CowboyMiddlewareValidate('params', {
		params: validator,
	})
}
