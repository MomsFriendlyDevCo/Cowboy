import CowboyMiddlewareValidate from '#middleware/validate';

export default function CowboyMiddlewareValidateQuery(validator) {
	return CowboyMiddlewareValidate('query', validator);
}
