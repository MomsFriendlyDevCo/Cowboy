export default function CowboyMiddlewareCORS(headers) {
	let injectHeaders = headers || {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': '*',
		'Content-Type': 'application/json;charset=UTF-8',
	};

	return (req, res) => {
		// Always inject CORS headers
		res.set(injectHeaders);

		// Handle hits to OPTIONS '/' endpoint
		req.router.options('/', (req, res) => {
			return res.sendStatus(200);
		});
	}
}
