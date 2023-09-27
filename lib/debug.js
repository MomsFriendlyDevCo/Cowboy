export default function CowboyDebug(...msg) {
	if (!CowboyDebug.enabled) return;
	console.log('COWBOY-DEBUG', ...msg.map(m =>
		typeof m == 'string' ? m
		: JSON.stringify(m)
	))
}
CowboyDebug.enabled = false;
