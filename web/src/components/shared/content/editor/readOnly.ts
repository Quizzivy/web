import { createContext } from "react";

/**
 * ContentReadOnlyContext turns every ContentEditor below it into its read-only
 * rendering (`readOnly`), for a page that shows a whole form it may not
 * change, such as a question a Can-use recipient opens (T-R7.19). An editor's
 * own `readOnly` wins over it.
 */
export const ContentReadOnlyContext = createContext(false);
