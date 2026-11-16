/**
 * Package sharing is D4's sharing for other features: the share dialog for a
 * test or a question set, and who may open it. Shared with me (T-R7.17) and
 * the question-set pages (T-R7.19) build on the same api and dialog.
 */
export { ShareDialog, type ShareDialogProps } from "./components/ShareDialog";
export { AccessSelect } from "./components/AccessSelect";
export { isOwner, useCanShare, type Owned } from "./access";
export type { ShareAccess, ShareGrant, ShareKind, ShareTeacher } from "./api";
