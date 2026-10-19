import type { ToolProbe } from '../types';
import { googleAccountProbe } from './google-account';
import { interviewProbe, questionnaireProbe, questionProbe } from './user-feedback';
import { webBookmarkProbe } from './web-bookmark';
import { fetchContentProbe, getSearchContentProbe } from './web-fetch';
import { codeSearchProbe, webSearchProbe } from './web-search';

/**
 * The order matters. get_search_content reads what fetch_content stored, and web_bookmark's
 * clear_history removes that history, so fetch_content runs first and web_bookmark after both.
 */
export const webFeedbackProbes: ToolProbe[] = [
  fetchContentProbe,
  getSearchContentProbe,
  webBookmarkProbe,
  webSearchProbe,
  codeSearchProbe,
  googleAccountProbe,
  questionProbe,
  questionnaireProbe,
  interviewProbe,
];
