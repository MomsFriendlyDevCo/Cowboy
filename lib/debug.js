/**
* Wrapper around the debug instance
* This function will only output when cowboy is in debug mode
*
* @param {*...} msg Message component to show
*/
export default function CowboyDebug(...msg) {
	if (!CowboyDebug.enabled) return;
	console.log('COWBOY-DEBUG', ...msg.map(m =>
		typeof m == 'string' ? m
		: JSON.stringify(m)
	))
}
CowboyDebug.enabled = false;
