/**
 * Netlify Function (v2 runtime) exposed at /.netlify/functions/analyze.
 * Reads CLOCKED_API_KEY from process.env on the server only.
 */
import { createAnalyzeHandler } from '../lib/analyzeHandler';

export default createAnalyzeHandler();

export const config = {
    rateLimit: {
        action: 'rate_limit',
        aggregateBy: 'ip',
        windowSize: 60,
        windowLimit: 10,
    },
};

