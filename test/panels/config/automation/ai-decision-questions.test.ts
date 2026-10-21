import { describe, expect, it } from "vitest";
import type { AIDecision } from "../../../../src/data/ai_task";
import {
  AI_TASK_EVALUATE_ACTION,
  buildAIDecision,
  buildEvaluateState,
  cameraAttachment,
  camerasFromAttachments,
  parseAIDecision,
  parseEvaluateState,
  withCameras,
} from "../../../../src/data/ai_task";
import {
  optionLabels,
  questionWithOptions,
} from "../../../../src/panels/config/automation/action/types/ha-automation-action-ai_decision";

const decision = (question: AIDecision["question"]): AIDecision => ({
  evaluate: {
    action: AI_TASK_EVALUATE_ACTION,
    data: { task_name: "Check", questions: {} },
  },
  questionId: "answer",
  question,
  responseVariable: "decision",
  threshold: 0.8,
  branches: [[{ delay: 1 }], [{ delay: 2 }]].slice(
    0,
    question.type === "noul" ? 1 : 2
  ),
  otherwise: [{ stop: "no" }],
});

describe("AI decision block", () => {
  it("round-trips a yes or no question through if/then/else", () => {
    const original = decision({ type: "noul", instructions: "Anyone?" });
    const built = buildAIDecision(original, { alias: "Kept" });
    expect(built.alias).toBe("Kept");
    expect((built.sequence![1] as any).if[0].value_template).toBe(
      "{{ decision.answers.answer.noul >= 0.8 }}"
    );
    expect(parseAIDecision(built)).toEqual({
      ...original,
      evaluate: built.sequence![0],
    });
  });

  it("round-trips choice and score questions through choose", () => {
    for (const question of [
      {
        type: "choice" as const,
        instructions: "Where?",
        criteria: { door: "At the door", nobody: "Nobody" },
      },
      {
        type: "score" as const,
        instructions: "How busy?",
        criteria: ["a", "b"],
      },
    ]) {
      const built = buildAIDecision(decision(question));
      const parsed = parseAIDecision(built)!;
      expect(parsed.question).toEqual(question);
      expect(parsed.branches).toEqual([[{ delay: 1 }], [{ delay: 2 }]]);
      expect(parsed.otherwise).toEqual([{ stop: "no" }]);
    }
  });

  it("leaves hand-written sequences alone", () => {
    const built = buildAIDecision(
      decision({ type: "noul", instructions: "Anyone?" })
    );
    (built.sequence![1] as any).if[0].value_template =
      "{{ decision.answers.answer.noul > 0.2 and is_state('sun.sun', 'above_horizon') }}";
    expect(parseAIDecision(built)).toBeUndefined();
    expect(
      parseAIDecision({ sequence: [{ delay: 1 }, { delay: 2 }] })
    ).toBeUndefined();
  });

  it("keys choice options by label, unique even for duplicates", () => {
    const choice = questionWithOptions("choice", "Where?", [
      "At the door",
      "At the door",
      "",
    ]);
    expect(choice).toEqual({
      type: "choice",
      instructions: "Where?",
      criteria: {
        at_the_door: "At the door",
        at_the_door_2: "At the door",
        option_3: "",
      },
    });
    expect(optionLabels(choice)).toEqual(["At the door", "At the door", ""]);
    expect(
      optionLabels(questionWithOptions("score", "Busy?", ["low", "high"]))
    ).toEqual(["low", "high"]);
  });
  it("round-trips typed context and picked entities through state", () => {
    const state = buildEvaluateState("Door open 10 min\n", [
      "sensor.co2",
      "binary_sensor.door",
    ]);
    expect(state).toContain("{{ states('sensor.co2', with_unit=True) }}");
    expect(parseEvaluateState(state)).toEqual({
      context: "Door open 10 min\n",
      entities: ["sensor.co2", "binary_sensor.door"],
    });
    expect(buildEvaluateState("  ", [])).toBeUndefined();
    expect(parseEvaluateState("{{ states('sensor.x') }}")).toEqual({
      context: "{{ states('sensor.x') }}",
      entities: [],
    });
  });

  it("swaps cameras but keeps other attachments", () => {
    const file = {
      media_content_id: "media-source://media_source/local/a.jpg",
      media_content_type: "image/jpeg",
    };
    const attachments = withCameras(
      [file, cameraAttachment("camera.old")],
      ["camera.a", "camera.b"]
    );
    expect(attachments[0]).toBe(file);
    expect(camerasFromAttachments(attachments)).toEqual([
      "camera.a",
      "camera.b",
    ]);
  });
});
