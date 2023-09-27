import joyful from '@momsfriendlydevco/joyful';

export default function CowboyMiddlewareValidate(validator) {
	return (req, res) => {
		let joyfulResult = joyful(req, validator, {throw: false});

		if (joyfulResult !== true) { // Failed body validation?
			return res
				.status(400)
				.send(joyfulResult)
		}
	}
}
