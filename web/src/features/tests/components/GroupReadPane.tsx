import { useEffect, useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ContentImage } from "@/components/shared/content/ContentImage";
import {
  ContentView,
  type AssetRenderer,
} from "@/components/shared/content/ContentView";
import { contentPlainText } from "@/components/shared/content/plainText";
import { ListSkeleton, LoadError } from "@/components/shared/ListState";
import type { MediaAsset } from "@/features/media/api";
import { DEFAULT_AUDIO_POLICY } from "@/features/question-bank/audioPolicy";
import {
  AssetRead,
  QuestionReadBody,
} from "@/features/question-bank/components/QuestionReadView";
import { getGroup, type GroupBundle } from "@/features/question-groups/api";
import { gapQuestions } from "@/features/question-groups/gapQuestions";
import { KIND_ICONS } from "@/features/question-groups/kindIcons";
import { groupKind } from "@/features/question-groups/kinds";
import { memberValues, type GroupGapBinding } from "@/features/question-groups/model";
import { hasReading } from "@/components/shared/content/materials";
import { nfc } from "@/lib/nfc";
import { cn } from "@/lib/utils";

const CARD = "bg-card shadow-card flex min-w-0 flex-col gap-4 rounded-xl border p-4";
const LABEL = "text-muted-fg text-[11.5px] font-semibold tracking-[0.06em] uppercase";

/**
 * GroupReadPane is a passage, a cloze or a recording for a Can-use recipient
 * (T-R7.18): what the group's pane edits, shown and inert. The heading gives
 * the kind, the section and the title, then the instructions; the material
 * is drawn as it reads, each gap a chip with the number of its question and
 * the word it takes, a recording with its player, its listening settings in
 * words and its transcript; each question is the bank's read view, its
 * correct answers marked. Nothing in it writes: it mounts no group editor,
 * so it never saves the group. `selectedQuestionId` scrolls to that
 * question's card.
 */
export function GroupReadPane({
  id,
  selectedQuestionId,
  section,
  firstNumber,
}: Readonly<{
  id: string;
  selectedQuestionId: string | null;
  section?: string | undefined;
  firstNumber: number;
}>) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["teacher-group", id],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => getGroup(id, signal),
  });
  useEffect(() => {
    if (selectedQuestionId === null || !query.isSuccess) return;
    document
      .querySelector(`[data-group-read-question="${CSS.escape(selectedQuestionId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedQuestionId, query.isSuccess]);
  if (query.isPending)
    return (
      <div className="p-4">
        <ListSkeleton rows={6} />
      </div>
    );
  if (query.isError)
    return (
      <div className="p-4">
        <LoadError error={query.error} onRetry={() => void query.refetch()}>
          {t("groups.loadFailed")}
        </LoadError>
      </div>
    );
  return (
    <GroupRead
      bundle={query.data.bundle}
      assets={query.data.assets}
      section={section}
      firstNumber={firstNumber}
      selectedQuestionId={selectedQuestionId}
      onRefresh={() => void query.refetch()}
    />
  );
}

function GroupRead({
  bundle,
  assets,
  section,
  firstNumber,
  selectedQuestionId,
  onRefresh,
}: Readonly<{
  bundle: GroupBundle;
  assets: MediaAsset[];
  section: string | undefined;
  firstNumber: number;
  selectedQuestionId: string | null;
  onRefresh: () => void;
}>) {
  const { t } = useTranslation();
  const headingId = useId();
  const kind = groupKind(bundle);
  const Icon = KIND_ICONS[kind];
  const name = t(`groups.kind.${kind}.name`);
  const { group } = bundle;
  const numbers = useMemo(
    () =>
      new Map(
        group.members.map((member, index) => [member.questionId, firstNumber + index]),
      ),
    [group.members, firstNumber],
  );
  const inputs = new Map(
    bundle.questions.map((question) => [question.id, question.input]),
  );
  const media = new Map(assets.map((asset) => [asset.id, asset]));
  const instructions = group.instructions
    ? contentPlainText(group.instructions).trim()
    : "";
  const points = bundle.questions.reduce(
    (sum, question) => sum + question.input.points,
    0,
  );
  return (
    <section
      aria-labelledby={headingId}
      className="@container/grp flex min-w-0 flex-col gap-3.5 p-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col items-start gap-1">
          <span className="text-muted-fg flex min-h-5 items-center gap-2 text-[12.5px]">
            <Icon aria-hidden="true" className="size-3.5" />
            {section ? `${name} · ${section}` : name}
          </span>
          <h2
            id={headingId}
            className="text-[19px] leading-[1.3] font-semibold tracking-[-0.01em] wrap-anywhere max-[767px]:text-[18px]"
          >
            {nfc(group.title) || t(`groups.kind.${kind}.new`)}
          </h2>
          {instructions === "" ? null : (
            <p className="text-[13px] text-pretty">{nfc(instructions)}</p>
          )}
        </div>
        <span className="text-muted-fg text-[12.5px] whitespace-nowrap">
          {t("groups.pane.summary", { count: group.members.length, points })}
        </span>
      </div>
      <div className="grid min-w-0 items-start gap-4 @min-[560px]/grp:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {group.stimuli.map((material) => (
            <Material
              key={material.id}
              bundle={bundle}
              material={material}
              media={media}
              numbers={numbers}
              onRefresh={onRefresh}
            />
          ))}
        </div>
        <ol className="m-0 flex min-w-0 list-none flex-col gap-4 p-0">
          {group.members.map((member) => {
            const input = inputs.get(member.questionId);
            if (input === undefined) return null;
            const values = memberValues(input);
            const asset =
              values.mediaAssetId === null ? undefined : media.get(values.mediaAssetId);
            return (
              <li
                key={member.questionId}
                data-group-read-question={member.questionId}
                aria-current={selectedQuestionId === member.questionId || undefined}
                className={cn(
                  CARD,
                  selectedQuestionId === member.questionId && "border-primary",
                )}
              >
                <p className="text-[13px] font-semibold">
                  {t("builder.editor.questionNumber", {
                    number: numbers.get(member.questionId) ?? 0,
                  })}
                  <span className="text-muted-fg ml-2 font-normal">
                    {t("builder.points", { count: values.points })}
                  </span>
                </p>
                <QuestionReadBody
                  value={values}
                  assets={assets}
                  promptLabel={t("questionEditor.question")}
                  onRefresh={onRefresh}
                />
                {asset === undefined ? null : (
                  <AssetRead
                    asset={asset}
                    policy={values.audio ?? DEFAULT_AUDIO_POLICY}
                    transcript={values.transcript}
                    alt={values.mediaAlt}
                    onRefresh={onRefresh}
                  />
                )}
              </li>
            );
          })}
          {group.members.length === 0 ? (
            <li className="text-muted-fg text-sm">{t("builder.emptySharedGroup")}</li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}

function Material({
  bundle,
  material,
  media,
  numbers,
  onRefresh,
}: Readonly<{
  bundle: GroupBundle;
  material: GroupBundle["group"]["stimuli"][number];
  media: ReadonlyMap<string, MediaAsset>;
  numbers: ReadonlyMap<string, number>;
  onRefresh: () => void;
}>) {
  const { t } = useTranslation();
  const gaps = useMemo(() => gapQuestions(bundle), [bundle]);
  const bindings = new Map(material.gaps.map((gap) => [gap.gapId, gap]));
  const recordings = new Map(
    bundle.group.recordings.map((recording) => [recording.assetId, recording]),
  );
  const reading = hasReading(material);
  const renderAsset: AssetRenderer = (node) => {
    const asset = media.get(node.assetId);
    if (!asset?.url) return <p role="status">{t("preview.materialUnavailable")}</p>;
    if (node.type === "image")
      return <ContentImage src={asset.url} alt={node.alt} onRetry={onRefresh} />;
    const recording = recordings.get(node.assetId);
    return (
      <AssetRead
        asset={asset}
        policy={recording?.policy ?? DEFAULT_AUDIO_POLICY}
        transcript={recording?.transcript}
        onRefresh={onRefresh}
      />
    );
  };
  return (
    <section
      aria-label={reading ? nfc(material.title) : t("groups.audio")}
      className={cn(CARD, "gap-3")}
    >
      {reading ? <p className={LABEL}>{nfc(material.title)}</p> : null}
      <div className={material.gaps.length > 0 ? "content-cloze" : undefined}>
        <ContentView
          document={material.content}
          renderAsset={renderAsset}
          renderGap={(gap) => {
            const binding = bindings.get(gap.id);
            if (binding === undefined)
              return <span className="content-gap">{nfc(gap.label)}</span>;
            const number = numbers.get(binding.questionId) ?? 0;
            const word = gapWord(bundle, gaps, binding);
            return (
              <span
                className="content-chip"
                data-state="filled"
                aria-label={t("groups.pane.gapAria", { number, word })}
              >
                <span aria-hidden="true" className="content-chip-number">
                  {number}
                </span>
                <span aria-hidden="true" className="content-chip-word">
                  {word}
                </span>
              </span>
            );
          }}
        />
      </div>
    </section>
  );
}

/** gapWord is the word a gap takes: its question's key, or the first accepted answer of the blank it binds. */
function gapWord(
  bundle: GroupBundle,
  gaps: ReturnType<typeof gapQuestions>,
  binding: GroupGapBinding,
): string {
  const gap = gaps.get(binding.questionId);
  if (gap) return gap.word;
  const input = bundle.questions.find((item) => item.id === binding.questionId)?.input;
  if (binding.kind === "blank")
    return (
      input?.blanks?.find((item) => item.gapId === binding.blankGapId)
        ?.acceptedAnswers[0] ?? ""
    );
  return input?.options?.find((item) => item.isCorrect)?.text ?? "";
}
