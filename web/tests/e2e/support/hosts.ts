/**
 * The three origins the E2E build is served on (playwright.config.ts): the
 * student host, the staff host, and one host for every page, which is the
 * `baseURL` of every spec that names no host.
 */
export const STUDENT_HOST = "http://localhost:4174";
export const STAFF_HOST = "http://localhost:4175";
export const ONE_HOST = "http://localhost:4173";

/**
 * LANDING_HOST is the landing site: a build of its own, with the student host
 * and the staff host above as the two hosts its links lead to.
 */
export const LANDING_HOST = "http://localhost:4176";

/**
 * LANDING_CENTRE is the centre's name the landing site's E2E build is given
 * (`VITE_ORG_NAME` in playwright.config.ts): one no source file spells.
 */
export const LANDING_CENTRE = "Sao Mai English Centre";
