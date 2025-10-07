import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function App() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="container mx-auto p-6 space-y-6">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        Biosero Rules Engine - Rule Editor
                    </h1>
                    <p className="text-muted-foreground">
                        Create and manage business rules with action workflows
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Test Card</CardTitle>
                        <CardDescription>This is a simple test to see if the app renders</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button>Test Button</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default App;