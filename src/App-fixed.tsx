import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue 
} from "@/components/ui/select";
import { 
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle 
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
    FilePlus, 
    FloppyDisk, 
    CloudArrowUp, 
    Trash, 
    Plus, 
    CheckCircle, 
    XCircle,
    Flask
} from "@phosphor-icons/react";
import { useKV } from '@github/spark/hooks';
import { toast } from 'sonner';

// ==========================================================================
// Types and Interfaces
// ==========================================================================

type RuleProperty = {
    name: string;
    value: any;
    valueType: string;
};

type Rule = {
    id: string | null;
    name: string;
    description: string;
    typeIdentifier: string;
    properties: RuleProperty[];
};

type Action = {
    _uid: string;
    ActionType: string;
    [key: string]: any;
};

type ActionType = {
    label: string;
    value: string;
    defaults: Record<string, any>;
};

// ==========================================================================
// Constants
// ==========================================================================

const ACTION_OPTIONS: ActionType[] = [
    { 
        label: "Rule Evaluation", 
        value: "RuleEvaluationAction", 
        defaults: { 
            ActionType: "RuleEvaluationAction", 
            EvaluationType: "", 
            Topic: "", 
            RuleName: "RuleEval1", 
            Status: "Success", 
            Timestamp: new Date().toISOString(), 
            VariableMappings: {}, 
            RuleAction: "use", 
            TargetRuleId: "" 
        } 
    },
    { 
        label: "Execute Orchestrator Workflow", 
        value: "ExecuteOrchestratorWorkflowAction", 
        defaults: { 
            ActionType: "ExecuteOrchestratorWorkflowAction", 
            TemplateName: "", 
            RuleName: "Rule1", 
            Status: "Success", 
            Timestamp: "2023-05-15T10:30:00Z", 
            InputParameters: {}, 
            OutputParameters: {} 
        } 
    },
    { 
        label: "Rest API Call", 
        value: "RestApiCallAction", 
        defaults: { 
            ActionType: "RestApiCallAction", 
            Url: "https://api.example.com/data", 
            Method: "POST", 
            RuleName: "ApiRule", 
            Status: "Success", 
            Timestamp: "2023-05-15T10:32:00Z" 
        } 
    },
    { 
        label: "Send Email Notification", 
        value: "SendEmailNotificationAction", 
        defaults: { 
            ActionType: "SendEmailNotificationAction", 
            Recipient: "user@example.com", 
            Subject: "Notification", 
            RuleName: "EmailRule", 
            Status: "Success", 
            Timestamp: "2023-05-15T10:35:00Z" 
        } 
    }
].sort((a, b) => a.label.localeCompare(b.label));

const OMITTED_ACTION_FIELDS = new Set([
    "_uid",
    "ActionType", 
    "RuleName",
    "Status",
    "Timestamp"
]);

const DEFAULT_RULE_TEMPLATE: Rule = {
    id: null,
    name: "",
    description: "",
    typeIdentifier: "Business Rule",
    properties: [
        {
            name: "RuleExpressionType",
            value: "LambdaExpression",
            valueType: "String"
        },
        {
            name: "Expression",
            value: "",
            valueType: "String"
        },
        {
            name: "ErrorMessage",
            value: "",
            valueType: "String"
        },
        {
            name: "OnSuccess",
            value: { Actions: [] },
            valueType: "String"
        },
        {
            name: "OnFailure",
            value: { Actions: [] },
            valueType: "String"
        }
    ]
};

// ==========================================================================
// Helper Utilities
// ==========================================================================

const generateUid = (): string => `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const safeStringifyJSON = (obj: any, indent = 0): string => {
    try {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) return '[Circular]';
                cache.add(value);
            }
            return value;
        }, indent);
    } catch (e) {
        console.error("safeStringifyJSON error:", e);
        return String(obj);
    }
};

const safeParseJSON = (str: any, defaultValue: any = null): any => {
    if (typeof str !== 'string') {
        if (typeof str === 'object' && str !== null) return str;
        return defaultValue;
    }
    try {
        if (str.trim() === "") return defaultValue;
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
};

// ==========================================================================
// React Components
// ==========================================================================

// Action Editor Component
interface ActionEditorProps {
    action: Action;
    onChange: (action: Action) => void;
}

const ActionEditor: React.FC<ActionEditorProps> = ({ action, onChange }) => {
    const handleActionTypeChange = (value: string) => {
        if (value === "none") {
            onChange({ _uid: action._uid, ActionType: "" });
            return;
        }

        const option = ACTION_OPTIONS.find(opt => opt.value === value);
        if (option) {
            const newAction: Action = {
                ...option.defaults,
                _uid: action._uid,
                ActionType: value
            };
            onChange(newAction);
        }
    };

    const handleFieldChange = (field: string, value: any) => {
        onChange({ ...action, [field]: value });
    };

    const getGenericFields = (): string[] => {
        return Object.keys(action).filter(key => 
            !OMITTED_ACTION_FIELDS.has(key) && 
            key !== '_uid' && 
            action.ActionType !== ''
        );
    };

    return (
        <div className="space-y-3 p-3 border rounded bg-card/50">
            <Select value={action.ActionType || "none"} onValueChange={handleActionTypeChange}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Action Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">-- Select Action Type --</SelectItem>
                    {ACTION_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {action.ActionType && action.ActionType !== "" && (
                <div className="space-y-2">
                    {getGenericFields().map(field => (
                        <div key={field}>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                {field}
                            </label>
                            <Input
                                value={action[field] || ''}
                                onChange={(e) => handleFieldChange(field, e.target.value)}
                                className="text-sm"
                                placeholder={`Enter ${field}`}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Multi Action Editor Component
interface MultiActionEditorProps {
    actions: Action[];
    onChange: (actions: Action[]) => void;
}

const MultiActionEditor: React.FC<MultiActionEditorProps> = ({ actions = [], onChange }) => {
    const handleActionChange = (uid: string, updatedAction: Action) => {
        const newActions = actions.map(a => (a._uid === uid ? updatedAction : a));
        onChange(newActions);
    };

    const handleRemoveAction = (uid: string) => {
        const newActions = actions.filter(a => a._uid !== uid);
        onChange(newActions);
    };

    const handleAddAction = () => {
        const newAction: Action = {
            _uid: generateUid(),
            ActionType: ""
        };
        onChange([...actions, newAction]);
    };

    return (
        <div className="space-y-3">
            {actions.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border rounded bg-muted/50 text-center">
                    No actions configured. Click "Add Action" to get started.
                </div>
            ) : (
                actions.map((action, index) => (
                    <div key={action._uid} className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-muted-foreground">
                                Action {index + 1}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveAction(action._uid)}
                                className="gap-1"
                            >
                                <Trash size={14} />
                                Remove
                            </Button>
                        </div>
                        <ActionEditor
                            action={action}
                            onChange={(updatedAction) => handleActionChange(action._uid, updatedAction)}
                        />
                    </div>
                ))
            )}
            
            <Button onClick={handleAddAction} variant="outline" className="gap-2 w-full">
                <Plus size={16} />
                Add Action
            </Button>
        </div>
    );
};

// ==========================================================================
// Main Application Component
// ==========================================================================

function App() {
    // Persistent state using useKV for data that should survive page refreshes
    const [jsonData, setJsonData] = useKV<Rule>("current-rule", DEFAULT_RULE_TEMPLATE);

    // Rule management handlers
    const handleNewRule = () => {
        setJsonData({ ...DEFAULT_RULE_TEMPLATE });
        toast.success("New rule created");
    };

    const handleSaveToFile = () => {
        if (!jsonData) return;

        try {
            const outputJson = safeStringifyJSON(jsonData, 2);
            const idPart = jsonData.id ? `${jsonData.id}_` : '';
            const sanitizedName = (jsonData.name || "Unnamed").replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${idPart}${sanitizedName}.json`;

            const blob = new Blob([outputJson], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`Rule saved as ${filename}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Save failed';
            toast.error(`Save error: ${message}`);
        }
    };

    // Handle input changes
    const handleInputChange = (field: string, value: any) => {
        setJsonData((current) => {
            const updated = current ? { ...current } : { ...DEFAULT_RULE_TEMPLATE };
            return { ...updated, [field]: value };
        });
    };

    const handlePropertyChange = (propertyName: string, value: any) => {
        setJsonData((current) => {
            const updated = current ? { ...current } : { ...DEFAULT_RULE_TEMPLATE };
            if (!updated.properties) return updated;
            
            const updatedProperties = updated.properties.map(prop => 
                prop.name === propertyName ? { ...prop, value } : prop
            );
            
            return { ...updated, properties: updatedProperties };
        });
    };

    // Handle action changes
    const handleActionsChange = (propertyName: 'OnSuccess' | 'OnFailure', actions: Action[]) => {
        handlePropertyChange(propertyName, { Actions: actions });
    };

    // Get property values for rendering
    const getPropertyValue = (propertyName: string): any => {
        const prop = jsonData?.properties?.find(p => p.name === propertyName);
        return prop?.value || "";
    };

    const getActions = (propertyName: 'OnSuccess' | 'OnFailure'): Action[] => {
        const propValue = getPropertyValue(propertyName);
        return safeParseJSON(propValue, { Actions: [] }).Actions || [];
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        Biosero Rules Engine - Rule Editor
                    </h1>
                    <p className="text-muted-foreground">
                        Create and manage business rules with action workflows
                    </p>
                </div>

                {/* Toolbar */}
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            {/* Main Actions */}
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={handleNewRule} className="gap-2">
                                    <FilePlus size={16} />
                                    New Rule
                                </Button>
                                <Button onClick={handleSaveToFile} variant="outline" className="gap-2">
                                    <FloppyDisk size={16} />
                                    Save to File
                                </Button>
                                <Button 
                                    onClick={() => toast.info("Upload feature coming soon")} 
                                    variant="outline"
                                    className="gap-2"
                                >
                                    <CloudArrowUp size={16} />
                                    Upload
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                {/* Main Content */}
                <div className="space-y-6">
                    {/* Rule Editor */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Rule Identity */}
                        <Card className="lg:col-span-1">
                            <CardHeader>
                                <CardTitle className="text-lg">Rule Identity</CardTitle>
                                <CardDescription>Basic rule information</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {jsonData?.id && (
                                    <div>
                                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                                            ID
                                        </label>
                                        <div className="text-sm bg-muted px-3 py-2 rounded font-mono">
                                            {jsonData.id}
                                        </div>
                                    </div>
                                )}
                                
                                <div>
                                    <label htmlFor="rule-name" className="block text-sm font-medium text-muted-foreground mb-1">
                                        Name *
                                    </label>
                                    <Input
                                        id="rule-name"
                                        value={jsonData?.name || ""}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Enter rule name"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="rule-description" className="block text-sm font-medium text-muted-foreground mb-1">
                                        Description
                                    </label>
                                    <Textarea
                                        id="rule-description"
                                        value={jsonData?.description || ""}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        placeholder="Enter rule description"
                                        rows={3}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Rule Properties */}
                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-lg">Rule Properties</CardTitle>
                                <CardDescription>Configure rule logic and behavior</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Expression */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label htmlFor="expression" className="block text-sm font-medium text-muted-foreground">
                                            Lambda Expression *
                                        </label>
                                        <Button
                                            onClick={() => toast.info("Validation feature coming soon")}
                                            variant="outline"
                                            size="sm"
                                            className="gap-2"
                                        >
                                            <Flask size={14} />
                                            Test
                                        </Button>
                                    </div>
                                    <Input
                                        id="expression"
                                        value={getPropertyValue("Expression")}
                                        onChange={(e) => handlePropertyChange("Expression", e.target.value)}
                                        placeholder="e.g., key == 'Ready' AND Convert.ToDouble(value) > 0.5"
                                        className="font-mono text-sm"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Use C#-like syntax. Variables will be automatically detected.
                                    </p>
                                </div>

                                {/* Error Message */}
                                <div>
                                    <label htmlFor="error-message" className="block text-sm font-medium text-muted-foreground mb-2">
                                        Error Message
                                    </label>
                                    <Input
                                        id="error-message"
                                        value={getPropertyValue("ErrorMessage")}
                                        onChange={(e) => handlePropertyChange("ErrorMessage", e.target.value)}
                                        placeholder="Message to display when rule evaluation fails"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Actions Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* On Success Actions */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <CheckCircle size={20} className="text-green-500" />
                                    On Success Actions
                                </CardTitle>
                                <CardDescription>
                                    Actions to execute when the rule evaluation succeeds
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <MultiActionEditor
                                    actions={getActions("OnSuccess")}
                                    onChange={(actions) => handleActionsChange("OnSuccess", actions)}
                                />
                            </CardContent>
                        </Card>

                        {/* On Failure Actions */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <XCircle size={20} className="text-red-500" />
                                    On Failure Actions
                                </CardTitle>
                                <CardDescription>
                                    Actions to execute when the rule evaluation fails
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <MultiActionEditor
                                    actions={getActions("OnFailure")}
                                    onChange={(actions) => handleActionsChange("OnFailure", actions)}
                                />
                            </CardContent>
                        </Card>
                    </div>

                    {/* JSON Preview */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Rule JSON</CardTitle>
                            <CardDescription>Current rule structure in JSON format</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96 font-mono">
                                {safeStringifyJSON(jsonData, 2)}
                            </pre>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default App;