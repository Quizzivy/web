import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import { OptionText } from "@/components/shared/content/OptionText";
import { QuestionProse } from "@/components/shared/content/QuestionProse";
import { RichBlankPrompt } from "@/components/shared/content/RichBlankPrompt";
import { questionGaps } from "@/components/shared/content/gaps";
import { isQuestionPromptContent } from "@/components/shared/content/questionContent";
import type { MediaAsset } from "@/features/media/api";
import { AudioPlayer } from "@/features/media/components/AudioPlayer";
import { assetMeta } from "@/features/media/format";
import { blankInputs } from "@/features/take-test/components/blankInputs";
import { PromptMedia } from "@/features/take-test/components/PromptMedia";
import { DEFAULT_AUDIO_POLICY, playsName } from "@/features/question-bank/audioPolicy";
import { matchItemKey, matchOptionKey } from "@/features/question-bank/matchKeys";
import {
  BANK_LEVELS,
  BANK_SKILLS,
} from "@/features/question-bank/pages/teacher/bankFilters";
import type { QuestionValues } from "@/features/question-bank/questionSchema";
import { optionLetter } from "@/features/question-bank/questionType";
import { nfc } from "@/lib/nfc";
import { cn } from "@/lib/utils";
import { GradingNote } from "./GradingNote";
import { MarkVisual } from "./OptionsEditor";
import { QUESTION_TYPE_ICONS } from "./questionTypeIcons";

const LABEL = "text-[13px] leading-[19.5px] font-medium";
const GROUP = "flex min-w-0 flex-col gap-1.5";
/** FIELD is a value as the deck draws it for Can use: full ink on the sidebar ground. */
const FIELD =
  "bg-sidebar min-w-0 rounded-[10px] border px-4 py-3 text-[14.5px] leading-[1.6] wrap-anywhere";
const VALUE =
  "bg-sidebar flex min-h-9 min-w-0 items-center rounded-[8px] border px-3 text-[13.5px] wrap-anywhere";
const ROW = "flex min-h-11 items-center gap-2.5 rounded-[9px] border py-1 pr-2.5 pl-1";
const CHIP =
  "bg-muted inline-flex h-5.5 items-center rounded-full border px-2 text-xs leading-none font-medium whitespace-nowrap";

/**
 * QuestionReadBody is the Question editor's main card for a reader who may
 * not change the question (Can use, T-R7.19), as "R7 Access Modes › Question
 * editor" draws it: the type without its switch, the prompt and the
 * explanation rendered (rich content or Markdown alike) on the sidebar
 * ground, and the type's answers with the correct ones marked, and no
 * control to add, remove or format anything. Prose media draw from the
 * question's signed `assets` and play.
 */
export function QuestionReadBody({
  value,
  assets,
  promptLabel,
  onRefresh,
}: Readonly<{
  value: QuestionValues;
  assets: readonly MediaAsset[];
  promptLabel: string;
  onRefresh?: (() => void) | undefined;
}>) {
  const { t } = useTranslation();
  const Icon = QUESTION_TYPE_ICONS[value.type];
  return (
    <PromptMedia assets={assets} onRetry={onRefresh}>
      <p className="bg-sidebar inline-flex h-8 items-center gap-1.5 self-start rounded-[7px] border px-2.5 text-[12.5px] whitespace-nowrap">
        <span className="sr-only">{t("questionEditor.typeLabel")}: </span>
        <Icon aria-hidden="true" className="size-3.25" />
        {t(`questionEditor.type.${value.type}`)}
      </p>
      <Field label={promptLabel}>
        <div className={FIELD}>
          <Prompt value={value} />
        </div>
      </Field>
      <div data-answer-area="" className="flex flex-col gap-2.5">
        <Answers value={value} />
        <GradingNote type={value.type} selectCount={value.selectCount} />
      </div>
      {value.explanation == null || value.explanation.trim() === "" ? null : (
        <Field label={t("questionEditor.explanation")}>
          <div className={FIELD}>
            <QuestionProse
              field="explanation"
              text={value.explanation}
              content={value.explanationContent}
            />
          </div>
        </Field>
      )}
    </PromptMedia>
  );
}

/**
 * QuestionReadSettings is the settings card's content for the same reader:
 * Points, Level and Skill as values, Tags as chips, and the question's media,
 * whose recording plays, with its listening settings in words.
 */
export function QuestionReadSettings({
  value,
  asset,
  onRefresh,
}: Readonly<{
  value: QuestionValues;
  asset: MediaAsset | null;
  onRefresh?: (() => void) | undefined;
}>) {
  const { t } = useTranslation();
  const level = BANK_LEVELS.find((one) => one === value.level);
  const skill = BANK_SKILLS.find((one) => one === value.skill);
  return (
    <>
      <dl className="flex flex-col gap-3">
        <Setting label={t("questionEditor.points")}>{value.points}</Setting>
        <Setting label={t("questionEditor.level")}>
          {level ? t(`bank.level.${level}`) : t("questionEditor.notSet")}
        </Setting>
        <Setting label={t("questionEditor.skill")}>
          {skill ? t(`tests.skill.${skill}`) : t("questionEditor.notSet")}
        </Setting>
        {value.tags.length === 0 ? null : (
          <div className={GROUP}>
            <dt className={LABEL}>{t("questionEditor.tags")}</dt>
            <dd className="m-0">
              <ul className="flex flex-wrap gap-1.25">
                {value.tags.map((tag) => (
                  <li key={tag} className={CHIP}>
                    {tag}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      {asset === null ? null : (
        <>
          <hr className="border-border" />
          <div className="flex flex-col gap-3">
            <p className="text-muted-fg text-[11.5px] font-semibold tracking-[0.06em] uppercase">
              {t("questionEditor.mediaLabel")}
            </p>
            <MediaRead value={value} asset={asset} onRefresh={onRefresh} />
          </div>
        </>
      )}
    </>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={GROUP}>
      <h2 id={id} className={LABEL}>
        {label}
      </h2>
      {children}
    </section>
  );
}

function Setting({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className={GROUP}>
      <dt className={LABEL}>{label}</dt>
      <dd className={cn("m-0", VALUE)}>{children}</dd>
    </div>
  );
}

function Prompt({ value }: Readonly<{ value: QuestionValues }>) {
  const { t } = useTranslation();
  const labels = useMemo(
    () =>
      value.promptContent != null && isQuestionPromptContent(value.promptContent)
        ? new Map(questionGaps(value.promptContent).map((gap) => [gap.id, gap.label]))
        : new Map<string, string>(),
    [value.promptContent],
  );
  if (value.type !== "fill_blank")
    return <QuestionProse text={value.prompt} content={value.promptContent} />;
  if (value.promptContent != null)
    return (
      <RichBlankPrompt
        text={value.prompt}
        content={value.promptContent}
        blanks={value.blanks}
        renderBlank={(blank) => (
          <BlankMark label={labels.get(blank.gapId ?? "") ?? String(blank.ordinal)} />
        )}
      />
    );
  return (
    <Markdown
      plugins={[blankInputs]}
      components={{
        span: ({ node, ...rest }) => {
          const n = node?.properties?.["data-blank"];
          return n == null ? (
            <span {...rest} />
          ) : (
            <BlankMark
              label={String(n)}
              name={t("questionEditor.blankOrdinal", { n })}
            />
          );
        },
      }}
    >
      {value.prompt}
    </Markdown>
  );
}

/** BlankMark stands where a student types: the gap's label on a short rule. */
function BlankMark({ label, name }: Readonly<{ label: string; name?: string }>) {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={name ?? t("questionEditor.gapAnswers.group", { label })}
      className="bg-muted mx-0.5 inline-flex min-w-12 items-baseline gap-1 rounded-[5px] border-b-2 px-1.5 text-[12.5px] font-semibold"
    >
      {label}
    </span>
  );
}

function Answers({ value }: Readonly<{ value: QuestionValues }>) {
  switch (value.type) {
    case "single_choice":
    case "multiple_choice":
    case "true_false":
    case "tfng":
      return <OptionsRead value={value} />;
    case "matching":
      return <MatchingRead value={value} />;
    case "fill_blank":
      return <BlanksRead value={value} />;
    case "short_answer":
      return (
        <div className="flex flex-col gap-4">
          <SampleRead text={value.sampleAnswer} />
          <WordLimitRead limit={value.maxWords ?? null} />
        </div>
      );
    case "essay":
      return (
        <div className="flex flex-col gap-4">
          <SampleRead text={value.sampleAnswer} />
          <RubricRead rubric={value.rubric ?? []} />
          <WordLimitRead limit={value.essayMaxWords ?? null} />
        </div>
      );
  }
}

function OptionsRead({ value }: Readonly<{ value: QuestionValues }>) {
  const { t } = useTranslation();
  const heading = useId();
  const choice = value.type === "single_choice" || value.type === "multiple_choice";
  const multiple = value.type === "multiple_choice";
  return (
    <div className="flex flex-col gap-2">
      <p id={heading} className={LABEL}>
        {choice ? t("questionEditor.options") : t("questionEditor.trueFalseLabel")}
        {multiple && value.selectCount != null ? (
          <span className="text-muted-fg font-normal">
            {" "}
            · {t("questionEditor.chooseExactly")} {value.selectCount}
          </span>
        ) : null}
      </p>
      <ul aria-labelledby={heading} className="flex flex-col gap-2">
        {value.options.map((option, index) => (
          <li
            key={option.id ?? index}
            className={cn(
              ROW,
              option.isCorrect ? "border-success bg-success-soft" : "bg-sidebar",
            )}
          >
            <span className="grid size-8 flex-none place-items-center">
              <MarkVisual multiple={multiple} on={option.isCorrect} />
            </span>
            {choice ? (
              <span
                aria-hidden="true"
                className="text-muted-fg w-4.5 flex-none text-[12.5px] font-semibold"
              >
                {optionLetter(index)}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 text-[14px]">
              <OptionText
                text={option.text}
                content={option.content ?? null}
                type={value.type}
              />
            </span>
            {option.isCorrect ? (
              <span className="text-success-ink flex-none text-xs leading-normal font-medium whitespace-nowrap">
                {t("questionEditor.correct")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchingRead({ value }: Readonly<{ value: QuestionValues }>) {
  const { t } = useTranslation();
  const items = value.matchItems ?? [];
  const used = new Set(items.map((item) => item.correctOption));
  const itemsHeading = useId();
  const optionsHeading = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p id={itemsHeading} className={LABEL}>
          {t("questionEditor.matching.items")}
        </p>
        <ul aria-labelledby={itemsHeading} className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={item.id ?? index} className={cn(ROW, "bg-sidebar pl-3")}>
              <span className="text-muted-fg w-5 flex-none text-[12.5px] font-semibold">
                {matchItemKey(index)}
              </span>
              <span className="min-w-0 flex-1 text-[14px] wrap-anywhere">
                {nfc(item.text)}
              </span>
              <span className="text-success-ink flex-none text-[12.5px] font-semibold">
                <span className="sr-only">{t("questionEditor.correct")}: </span>
                {matchOptionKey(item.correctOption)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p id={optionsHeading} className={LABEL}>
          {t("questionEditor.options")}
        </p>
        <ul aria-labelledby={optionsHeading} className="flex flex-col gap-2">
          {value.options.map((option, index) => (
            <li key={option.id ?? index} className={cn(ROW, "bg-sidebar pl-3")}>
              <span className="text-muted-fg w-5 flex-none text-[12.5px] font-semibold">
                {matchOptionKey(index)}
              </span>
              <span className="min-w-0 flex-1 text-[14px]">
                <OptionText text={option.text} content={option.content ?? null} />
              </span>
              {used.has(index) ? null : (
                <span
                  title={t("questionEditor.matching.extraTitle")}
                  className="text-muted-fg flex-none text-xs"
                >
                  {t("questionEditor.matching.extra")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {value.matchAllowReuse === true ? (
        <p className="text-muted-fg text-[12.5px]">
          {t("questionEditor.matching.reuse")}
        </p>
      ) : null}
    </div>
  );
}

function BlanksRead({ value }: Readonly<{ value: QuestionValues }>) {
  const { t } = useTranslation();
  const heading = useId();
  const rich =
    value.promptContent != null && isQuestionPromptContent(value.promptContent);
  const rows = useMemo(() => {
    if (value.promptContent != null && isQuestionPromptContent(value.promptContent)) {
      const byGap = new Map(value.blanks.map((blank) => [blank.gapId, blank]));
      return questionGaps(value.promptContent).flatMap((gap) => {
        const blank = byGap.get(gap.id);
        return blank ? [{ label: gap.label, blank }] : [];
      });
    }
    return [...value.blanks]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((blank) => ({ label: String(blank.ordinal), blank }));
  }, [value.blanks, value.promptContent]);
  return (
    <div className="flex flex-col gap-2">
      <p id={heading} className={LABEL}>
        {rich ? t("questionEditor.gapAnswers.label") : t("questionEditor.blanks")}
      </p>
      <ul aria-labelledby={heading} className="flex flex-col gap-2">
        {rows.map(({ label, blank }) => (
          <li
            key={blank.id ?? label}
            className={cn(ROW, "bg-sidebar flex-wrap gap-y-1.5 py-2 pl-3")}
          >
            <span className="flex-none text-[12.5px] font-semibold">
              {rich
                ? t("questionEditor.gapAnswers.group", { label })
                : t("questionEditor.blankOrdinal", { n: label })}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.25">
              {blank.acceptedAnswers.map((answer, index) => (
                <span key={index} className={cn(CHIP, "whitespace-pre-wrap")}>
                  {nfc(answer)}
                </span>
              ))}
            </span>
            {blank.caseSensitive ? (
              <span className="text-muted-fg flex-none text-xs">
                {t("questionEditor.gapAnswers.matchCase")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SampleRead({ text }: Readonly<{ text: string | null }>) {
  const { t } = useTranslation();
  if (text == null || text.trim() === "") return null;
  return (
    <Field label={t("questionEditor.sampleAnswer")}>
      <p className={cn(FIELD, "text-[14px] whitespace-pre-wrap")}>{nfc(text)}</p>
    </Field>
  );
}

function WordLimitRead({ limit }: Readonly<{ limit: number | null }>) {
  const { t } = useTranslation();
  return (
    <dl className={GROUP}>
      <dt className={LABEL}>{t("questionEditor.wordLimit")}</dt>
      <dd className={cn("m-0 self-start", VALUE)}>
        {limit ?? t("questionEditor.wordLimitPlaceholder")}
      </dd>
    </dl>
  );
}

function RubricRead({
  rubric,
}: Readonly<{ rubric: NonNullable<QuestionValues["rubric"]> }>) {
  const { t } = useTranslation();
  const heading = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={heading} className={LABEL}>
        {t("questionEditor.rubric.label")}
      </p>
      {rubric.length === 0 ? (
        <p className="text-muted-fg text-[12.5px]">{t("questionEditor.rubric.none")}</p>
      ) : (
        <ol aria-labelledby={heading} className="flex flex-col gap-2">
          {rubric.map((criterion, index) => (
            <li key={criterion.id ?? index} className={cn(ROW, "bg-sidebar pl-3")}>
              <span className="text-muted-fg w-5 flex-none text-[12.5px] font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-[14px] wrap-anywhere">
                {nfc(criterion.label)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MediaRead({
  value,
  asset,
  onRefresh,
}: Readonly<{
  value: QuestionValues;
  asset: MediaAsset;
  onRefresh?: (() => void) | undefined;
}>) {
  const { t } = useTranslation();
  const retry = onRefresh ? { onRetry: onRefresh } : {};
  const policy = value.audio ?? DEFAULT_AUDIO_POLICY;
  const rules = [
    (policy.allowPause ?? true) ? "questionEditor.questionMedia.allowPause" : null,
    policy.allowSeek ? "questionEditor.questionMedia.allowSeek" : null,
    policy.showTranscriptAfterSubmit
      ? "questionEditor.questionMedia.showTranscript"
      : null,
  ].filter((rule) => rule !== null);
  return (
    <div className="overflow-hidden rounded-[10px] border">
      <p className="flex flex-col px-3 py-2.5">
        <span
          title={asset.originalFilename}
          className="line-clamp-2 text-[13.5px] font-medium wrap-anywhere"
        >
          {asset.originalFilename}
        </span>
        <span className="text-muted-fg text-xs">{assetMeta(asset, t)}</span>
      </p>
      {asset.kind === "audio" ? (
        <>
          <div className="bg-sidebar border-t px-3 py-2.5">
            <AudioPlayer
              src={asset.url}
              label={asset.originalFilename}
              durationMs={asset.durationMs}
              size="row"
              {...retry}
            />
          </div>
          <ul className="flex flex-col gap-1.5 border-t px-3 py-2.5 text-[12.5px]">
            <li>
              {t("questionEditor.questionMedia.plays")}:{" "}
              <span className="font-medium">{playsName(policy.maxPlays, t)}</span>
            </li>
            {rules.map((rule) => (
              <li key={rule} className="flex items-center gap-1.5">
                <Check aria-hidden="true" className="text-success-ink size-3.5" />
                {t(rule)}
              </li>
            ))}
          </ul>
          {value.transcript == null || value.transcript.trim() === "" ? null : (
            <div className="flex flex-col gap-1 border-t px-3 py-2.5">
              <p className="text-[12.5px] font-medium">
                {t("questionEditor.questionMedia.transcript")}
              </p>
              <p className="text-sm leading-normal whitespace-pre-wrap">
                {nfc(value.transcript)}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 border-t p-3">
          <img
            src={asset.url}
            alt={value.mediaAlt ?? asset.originalFilename}
            className="bg-muted h-55 w-full rounded-[8px] object-contain"
            onError={onRefresh}
          />
          {value.mediaAlt ? (
            <p className="text-muted-fg text-xs leading-normal">
              {t("questionEditor.questionMedia.altLabel")}: {nfc(value.mediaAlt)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
