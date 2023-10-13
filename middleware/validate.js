import joyful from '@momsfriendlydevco/joyful';

export default function CowboyMiddlewareValidate(subkey, validator) {
	return (req, res) => {
		let joyfulResult = joyful({
			[subkey]: validator,
		});

		if (joyfulResult !== true) { // Failed body validation?
			return res
				.status(400)
				.send(joyfulResult)
		}
	}
}
