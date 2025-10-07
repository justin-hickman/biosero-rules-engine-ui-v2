import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePlus, FloppyDisk, CloudArrowUp, Trash, Plus, Network } from "@phosphor-icons/react";
import { useKV } from '@github/spark/hooks';
import { toast } from 'sonner';

// Basic rule structure
type Rule = {
    id: string | null;
    name: string;
    description: string;
    typeIdentifier: string;
    properties: any[];
};

const DEFAULT_RULE_TEMPLATE: Rule = {
    id: null,
    name: "",
    description: "",
    typeIdentifier: "Business Rule",
    properties: []
};

function App() {
    const [jsonData, setJsonData] = useKV<Rule>("current-rule", DEFAULT_RULE_TEMPLATE);

    const handleNewRule = () => {
        setJsonData({ ...DEFAULT_RULE_TEMPLATE });
        toast.success("New rule created");
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
                    <CardHeader>
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={handleNewRule} className="gap-2">
                                    <FilePlus size={16} />
                                    New Rule
                                </Button>
                                <Button className="gap-2">
                                    <FloppyDisk size={16} />
                                    Save to File
                                </Button>
                                <Button className="gap-2">
                                    <CloudArrowUp size={16} />
                                    Upload
                                </Button>
                                <Button className="gap-2">
                                    <Network size={16} />
                                    Chain Map
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                {/* Rule Editor */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Rule Identity */}
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle className="text-lg">Rule Identity</CardTitle>
                            <CardDescription>Basic rule information</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label htmlFor="rule-name" className="block text-xs font-medium text-muted-foreground mb-1">
                                    Name *
                                </label>
                                <Input
                                    id="rule-name"
                                    value={jsonData?.name || ""}
                                    onChange={(e) => setJsonData(prev => ({ ...prev!, name: e.target.value }))}
                                    placeholder="Enter rule name"
                                />
                            </div>
                            <div>
                                <label htmlFor="rule-description" className="block text-xs font-medium text-muted-foreground mb-1">
                                    Description
                                </label>
                                <Input
                                    id="rule-description"
                                    value={jsonData?.description || ""}
                                    onChange={(e) => setJsonData(prev => ({ ...prev!, description: e.target.value }))}
                                    placeholder="Enter rule description"
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
                        <CardContent>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">
                                    Lambda Expression *
                                </label>
                                <Input
                                    placeholder="e.g., key == 'Ready' AND Convert.ToDouble(value) > 0.5"
                                    className="font-mono text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Use C#-like syntax. Variables will be automatically detected.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default App;