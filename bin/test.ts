import pageRoute from '../src';

pageRoute({
  pageDir: 'src/views',
  pageGlobs: ['**/**.{vue,tsx,jsx}', '**/\\[**\\].{vue,tsx,jsx}', '!**/components/**']
});
