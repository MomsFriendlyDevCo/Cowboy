import cors from '#middleware/cors';
import parseJwt from '#middleware/parseJwt';
import validate from '#middleware/validate';
import validateBody from '#middleware/validateBody';
import validateHeaders from '#middleware/validateHeaders';
import validateParams from '#middleware/validateParams';
import validateQuery from '#middleware/validateQuery';

export default {
	cors,
	parseJwt,
	validate,
	validateBody,
	validateHeaders,
	validateParams,
	validateQuery,
}
