import CowboyMiddlewareValidate from '#middleware/validate';

export default function CowboyMiddlewareValidateBody(validator) {
	return CowboyMiddlewareValidate({
		body: validator,
	})
}
