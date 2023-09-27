import cors from '#middleware/cors';
import validate from '#middleware/validate';
import validateBody from '#middleware/validateBody';
import validateParams from '#middleware/validateParams';
import validateQuery from '#middleware/validateQuery';

export default {
	cors,
	validate,
	validateBody,
	validateParams,
	validateQuery,
}
