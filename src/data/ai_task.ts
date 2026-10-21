import type { HomeAssistant } from "../types";
import type {
  Action,
  ChooseAction,
  IfAction,
  SequenceAction,
  ServiceAction,
} from "./script";
import type { Selector } from "./selector";

export enum AITaskEntityFeature {
  GENERATE_DATA = 1,
  SUPPORT_ATTACHMENTS = 2,
  GENERATE_IMAGE = 4,
  EVALUATE = 8,
}
export interface AITaskPreferences {
  evaluate_entity_id: string | null;
  allow_automatic_evaluation: boolean;
  gen_data_entity_id: string | null;
  gen_image_entity_id: string | null;
}

export interface GenDataTask {
  task_name: string;
  entity_id?: string;
  instructions: string;
  structure?: AITaskStructure;
}

export interface GenDataTaskResult<T = string> {
  conversation_id: string;
  data: T;
}

export interface AITaskStructureField {
  description?: string;
  required?: boolean;
  selector: Selector;
}

export type AITaskStructure = Record<string, AITaskStructureField>;

export const fetchAITaskPreferences = (hass: HomeAssistant) =>
  hass.callWS<AITaskPreferences>({
    type: "ai_task/preferences/get",
  });

export const saveAITaskPreferences = (
  hass: HomeAssistant,
  preferences: Partial<AITaskPreferences>
) =>
  hass.callWS<AITaskPreferences>({
    type: "ai_task/preferences/set",
    ...preferences,
  });

export const generateDataAITask = async <T = string>(
  hass: HomeAssistant,
  task: GenDataTask
): Promise<GenDataTaskResult<T>> => {
  const result = await hass.callService<GenDataTaskResult<T>>(
    "ai_task",
    "generate_data",
    task,
    undefined,
    true,
    true
  );
  return result.response!;
};

export const AI_TASK_EVALUATE_ACTION = "ai_task.evaluate";

export type AITaskQuestionType = "noul" | "choice" | "score";

export interface AITaskNoulQuestion {
  type: "noul";
  instructions: string;
}

export interface AITaskChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface AITaskScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type AITaskQuestion =
  AITaskNoulQuestion | AITaskChoiceQuestion | AITaskScoreQuestion;

export interface AITaskAttachment {
  media_content_id: string;
  media_content_type: string;
}

/** The `data` of an `ai_task.evaluate` action. */
export interface AITaskEvaluateData {
  task_name: string;
  questions: Record<string, AITaskQuestion>;
  state?: unknown;
  entity_id?: string;
  attachments?: AITaskAttachment[];
}

const CAMERA_MEDIA_SOURCE_PREFIX = "media-source://camera/";

/** A snapshot of the camera, as the attachment the task evaluates. */
export const cameraAttachment = (entityId: string): AITaskAttachment => ({
  media_content_id: `${CAMERA_MEDIA_SOURCE_PREFIX}${entityId}`,
  media_content_type: "image/jpeg",
});

export const camerasFromAttachments = (
  attachments: AITaskAttachment[] | undefined
): string[] =>
  (attachments ?? [])
    .filter((attachment) =>
      attachment.media_content_id?.startsWith(CAMERA_MEDIA_SOURCE_PREFIX)
    )
    .map((attachment) =>
      attachment.media_content_id.substring(CAMERA_MEDIA_SOURCE_PREFIX.length)
    );

/** Swap the camera snapshots, keeping any other attachments as they were. */
export const withCameras = (
  attachments: AITaskAttachment[] | undefined,
  cameras: string[]
): AITaskAttachment[] => [
  ...(attachments ?? []).filter(
    (attachment) =>
      !attachment.media_content_id?.startsWith(CAMERA_MEDIA_SOURCE_PREFIX)
  ),
  ...cameras.map(cameraAttachment),
];

// One line per picked entity in the task's `state`, rendered by core when the
// task runs, so the AI sees the current name, state and unit.
const entityLine = (entityId: string) =>
  `- {{ state_attr('${entityId}', 'friendly_name') }}: {{ states('${entityId}', with_unit=True) }}`;

const ENTITY_LINE =
  /^- \{\{ state_attr\('([^']+)', 'friendly_name'\) \}\}: \{\{ states\('\1', with_unit=True\) \}\}$/;

/** The task's `state`: the typed context, then a line per picked entity. */
export const buildEvaluateState = (
  context: string,
  entities: string[]
): string | undefined =>
  // Untrimmed, so a newline being typed survives the round trip.
  [...(context.trim() ? [context] : []), ...entities.map(entityLine)].join(
    "\n"
  ) || undefined;

export const parseEvaluateState = (
  state: unknown
): { context: string; entities: string[] } => {
  const entities: string[] = [];
  const context: string[] = [];
  for (const line of typeof state === "string" ? state.split("\n") : []) {
    const match = ENTITY_LINE.exec(line);
    if (match) {
      entities.push(match[1]);
    } else {
      context.push(line);
    }
  }
  return { context: context.join("\n"), entities };
};

/**
 * The "Ask AI" building block: an `ai_task.evaluate` step with one question,
 * followed by an `if` (yes or no) or a `choose` (one branch per option or
 * level) that reads the answer. Saved as plain YAML inside a `sequence`.
 */
export interface AIDecision {
  evaluate: ServiceAction;
  questionId: string;
  question: AITaskQuestion;
  responseVariable: string;
  /** How sure the AI must be before "yes" runs, 0 to 1. Yes or no only. */
  threshold: number;
  /** One branch per outcome: "yes", each choice key, or each score level. */
  branches: Action[][];
  otherwise: Action[];
}

export const AI_DECISION_DEFAULT_THRESHOLD = 0.5;

export const aiDecisionOutcomes = (question: AITaskQuestion): string[] =>
  question.type === "noul"
    ? ["yes"]
    : question.type === "choice"
      ? Object.keys(question.criteria ?? {})
      : (question.criteria ?? []).map((_, index) => String(index));

const answerTemplate = (
  decision: Pick<
    AIDecision,
    "responseVariable" | "questionId" | "question" | "threshold"
  >,
  outcome: string
) => {
  const answer = `${decision.responseVariable}.answers.${decision.questionId}`;
  switch (decision.question.type) {
    case "noul":
      return `{{ ${answer}.noul >= ${decision.threshold} }}`;
    case "choice":
      return `{{ ${answer}.choice == '${outcome}' }}`;
    default:
      // The score is the expected level index, so round to the nearest level.
      return `{{ ${answer}.score | round | int == ${outcome} }}`;
  }
};

const templateCondition = (value_template: string) => ({
  condition: "template" as const,
  value_template,
});

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const singleTemplate = (conditions: unknown): string | undefined => {
  const list = asArray(conditions as any);
  return list.length === 1 && list[0]?.condition === "template"
    ? list[0].value_template
    : undefined;
};

export const buildAIDecision = (
  decision: AIDecision,
  base: Partial<SequenceAction> = {}
): SequenceAction => {
  const outcomes = aiDecisionOutcomes(decision.question);
  const otherwise = decision.otherwise.length ? decision.otherwise : undefined;
  const branch: IfAction | ChooseAction =
    decision.question.type === "noul"
      ? {
          if: [templateCondition(answerTemplate(decision, "yes"))],
          then: decision.branches[0] ?? [],
          ...(otherwise ? { else: otherwise } : {}),
        }
      : {
          choose: outcomes.map((outcome, index) => ({
            conditions: [templateCondition(answerTemplate(decision, outcome))],
            sequence: decision.branches[index] ?? [],
          })),
          ...(otherwise ? { default: otherwise } : {}),
        };
  return {
    ...base,
    sequence: [
      {
        ...decision.evaluate,
        data: {
          ...decision.evaluate.data,
          questions: { [decision.questionId]: decision.question },
        },
        response_variable: decision.responseVariable,
      },
      branch,
    ],
  };
};

/** Read the block back, or undefined when the YAML has another shape. */
export const parseAIDecision = (action: unknown): AIDecision | undefined => {
  const steps = (action as SequenceAction | undefined)?.sequence;
  if (!Array.isArray(steps) || steps.length !== 2) {
    return undefined;
  }
  const [evaluate, branch] = steps as [ServiceAction, any];
  if (
    evaluate?.action !== AI_TASK_EVALUATE_ACTION ||
    typeof evaluate.response_variable !== "string" ||
    !branch
  ) {
    return undefined;
  }
  const questions = Object.entries(
    ((evaluate.data ?? {}) as Partial<AITaskEvaluateData>).questions ?? {}
  );
  if (questions.length !== 1) {
    return undefined;
  }
  const [questionId, question] = questions[0];
  const decision: AIDecision = {
    evaluate,
    questionId,
    question,
    responseVariable: evaluate.response_variable,
    threshold: AI_DECISION_DEFAULT_THRESHOLD,
    branches: [],
    otherwise: [],
  };

  if (question.type === "noul") {
    const template = "if" in branch ? singleTemplate(branch.if) : undefined;
    const threshold = Number(/>= ([0-9.]+) \}\}$/.exec(template ?? "")?.[1]);
    if (
      Number.isNaN(threshold) ||
      template !== answerTemplate({ ...decision, threshold }, "yes")
    ) {
      return undefined;
    }
    return {
      ...decision,
      threshold,
      branches: [asArray<Action>(branch.then)],
      otherwise: asArray<Action>(branch.else),
    };
  }

  const options = "choose" in branch ? asArray<any>(branch.choose) : undefined;
  const outcomes = aiDecisionOutcomes(question);
  if (
    !options ||
    options.length !== outcomes.length ||
    options.some(
      (option, index) =>
        singleTemplate(option.conditions) !==
        answerTemplate(decision, outcomes[index])
    )
  ) {
    return undefined;
  }
  return {
    ...decision,
    branches: options.map((option) => asArray<Action>(option.sequence)),
    otherwise: asArray<Action>(branch.default),
  };
};
