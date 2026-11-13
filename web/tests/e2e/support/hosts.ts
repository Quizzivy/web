/**
 * The three origins the E2E build is served on (playwright.config.ts): the
 * student host, the staff host, and one host for every page, which is the
 * `baseURL` of every spec that names no host.
 */
export const STUDENT_HOST = "http://localhost:4174";
export const STAFF_HOST = "http://localhost:4175";
export const ONE_HOST = "http://localhost:4173";
