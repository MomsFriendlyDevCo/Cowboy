/**
* Only permit access if Cloudflare is running in development mode
* This should only permit access in local dev environments
*
* @returns {CowboyMiddleware} A CowboyMiddleware worker which will return 403 if not in development mode
*/
export default function CowboyMiddlewareDevOnly() {
	return (req, res, env) => {
		const isDev = env.ENVIRONMENT === 'development';

		if (!isDev) return res
			.status(403)
			.send('Endpoint responds in development mode only');
	};
}
