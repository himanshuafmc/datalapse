// Values the build fills in (tools/build.mjs). Unbundled (tests, Node) they
// fall back to blanks.
/* global __DL_VERSION__, __DL_HOMEPAGE__, __DL_REPO__ */

export const VERSION = typeof __DL_VERSION__ !== 'undefined' ? __DL_VERSION__ : 'dev';
export const HOMEPAGE = typeof __DL_HOMEPAGE__ !== 'undefined' ? __DL_HOMEPAGE__ : '';
export const REPO = typeof __DL_REPO__ !== 'undefined' ? __DL_REPO__ : '';
