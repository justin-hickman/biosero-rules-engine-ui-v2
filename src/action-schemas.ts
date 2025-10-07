// action-schemas.ts
export type FieldKind = "string" | "enum" | "json";

export type FieldDef = {
  name: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
};

export type ActionSchema = {
  type: string;
  fields: FieldDef[];
  validate(params: Record<string, any>): string[]; // return list of error strings
};

export const RuleEvaluationSchema: ActionSchema = {
  type: "RuleEvaluationAction",
  fields: [
    { name: "EvaluationType", kind: "enum", required: true, options: ["Single","Competitive","Parallel","Hierarchical","Composite"] },
    { name: "Topic", kind: "string" },
    { name: "RuleAction", kind: "enum", options: ["use","skip","abort"] },
    { name: "TargetRuleId", kind: "string" }, // only for Single
    { name: "VariableMappings", kind: "json" }
  ],
  validate: (p) => {
    const errs: string[] = [];
    if (!p?.EvaluationType) errs.push("RuleEvaluationAction.EvaluationType is required");
    if (p?.EvaluationType === "Single" && !p?.TargetRuleId)
      errs.push("RuleEvaluationAction.TargetRuleId is required for Single evaluation");
    return errs;
  }
};

export const ExecuteOrchestratorWorkflowSchema: ActionSchema = {
  type: "ExecuteOrchestratorWorkflowAction",
  fields: [
    { name: "TemplateName", kind: "string", required: true },
    { name: "InputParameters", kind: "json" },
    { name: "OutputParameters", kind: "json" }
  ],
  validate: (p) => {
    const errs: string[] = [];
    if (!p?.TemplateName) errs.push("ExecuteOrchestratorWorkflowAction.TemplateName is required");
    return errs;
  }
};

export const ExecuteGbgSchedulerProcessSchema: ActionSchema = {
  type: "ExecuteGbgSchedulerProcessAction",
  fields: [
    { name: "TemplateName", kind: "string", required: true },
    { name: "InputParameters", kind: "json" },
    { name: "OutputParameters", kind: "json" }
  ],
  validate: (p) => {
    const errs: string[] = [];
    if (!p?.TemplateName) errs.push("ExecuteGbgSchedulerProcessAction.TemplateName is required");
    return errs;
  }
};

export const SupportedSchemas: Record<string, ActionSchema> = {
  RuleEvaluationAction: RuleEvaluationSchema,
  ExecuteOrchestratorWorkflowAction: ExecuteOrchestratorWorkflowSchema,
  ExecuteGbgSchedulerProcessAction: ExecuteGbgSchedulerProcessSchema
};

export const isSupportedAction = (t: string) => !!SupportedSchemas[t];
export const getSchema = (t: string) => SupportedSchemas[t];
export const isTemplateDrivenAction = (actionType: string) => 
  actionType === "ExecuteOrchestratorWorkflowAction" || 
  actionType === "ExecuteGbgSchedulerProcessAction";