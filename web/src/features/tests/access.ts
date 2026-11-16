import { givenName } from "@/features/assignments/studentTime";
import { useAuthStore } from "@/stores/auth";
import type { Test } from "./api";

/**
 * TestAccess is what the builder and test detail follow for one test
 * (T-R7.18): `access` is the contract's (`owner`, `edit` or `use`), `mine`
 * says whether the signed-in teacher owns it, told from `owner.id` because
 * `scope.all` reads as `owner` (ContentAccess). A session that has not named
 * its user yet trusts `access`. `readOnly` is Can use. `forTestId` is the
 * test's id when the caller is not its owner, whatever their access: what
 * they add to the draft must land in the owner's bank (copy-on-add, T-R7.5).
 */
export type TestAccess = Readonly<{
  access: Test["access"];
  mine: boolean;
  readOnly: boolean;
  forTestId: string | undefined;
  owner: Test["owner"];
  ownerGiven: string;
}>;

export function testAccess(
  test: Test,
  me: Readonly<{ id: string }> | null,
): TestAccess {
  const mine = me === null ? test.access === "owner" : test.owner.id === me.id;
  return {
    access: test.access,
    mine,
    readOnly: test.access === "use",
    forTestId: mine ? undefined : test.id,
    owner: test.owner,
    ownerGiven: givenName(test.owner.name),
  };
}

/** useTestAccess is `testAccess` for the signed-in teacher. */
export function useTestAccess(test: Test): TestAccess {
  const me = useAuthStore((state) => state.user);
  return testAccess(test, me);
}

/**
 * SharingStopped is what a builder write throws, without sending anything,
 * once a save has found that the owner stopped sharing the test: the
 * builder has given way to AccessRemovedNotice and nothing further goes out.
 */
export class SharingStopped extends Error {}
