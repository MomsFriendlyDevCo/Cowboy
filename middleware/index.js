import cors from '#middleware/cors';
import devOnly from '#middleware/devOnly';
import etagCaching from '#middleware/etagCaching';
import parseJwt from '#middleware/parseJwt';
import validate from '#middleware/validate';
import validateBody from '#middleware/validateBody';
import validateHeaders from '#middleware/validateHeaders';
import validateParams from '#middleware/validateParams';
import validateQuery from '#middleware/validateQuery';

export default {
	cors,
	devOnly,
	etagCaching,
	parseJwt,
	validate,
	validateBody,
	validateHeaders,
	validateParams,
	validateQuery,
}
