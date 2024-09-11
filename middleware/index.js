import cors from '#middleware/cors';
import validate from '#middleware/validate';
import validateBody from '#middleware/validateBody';
import validateHeaders from '#middleware/validateHeaders';
import validateParams from '#middleware/validateParams';
import validateQuery from '#middleware/validateQuery';

export default {
	cors,
	validate,
	validateBody,
	validateHeaders,
	validateParams,
	validateQuery,
}
