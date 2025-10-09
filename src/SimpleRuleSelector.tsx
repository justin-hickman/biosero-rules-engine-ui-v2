import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface SimpleRuleSelectorProps {
    dataServicesRootURI: string;
    onRuleSelect: (ruleId: string) => void;
    value: string;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}

const SimpleRuleSelector: React.FC<SimpleRuleSelectorProps> = ({
    dataServicesRootURI,
    onRuleSelect,
    value,
    className = "",
    placeholder = "Select rule",
    disabled = false
}) => {
    const [rules, setRules] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const fetchRules = React.useCallback(async () => {
        if (!dataServicesRootURI) {
            setError("Data Services URL not set");
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const response = await fetch(`${dataServicesRootURI}/api/v3.0/identities?typeIdentifier=${encodeURIComponent('Business Rule')}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const rulesArray = Array.isArray(data) ? data : (data?.items || data?.results || []);
            setRules(rulesArray.sort((a, b) => (a?.name || '').localeCompare(b?.name || '')));
        } catch (err: any) {
            const message = err.message || 'Failed to fetch rules';
            setError(message);
            console.error('Rules fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [dataServicesRootURI]);

    React.useEffect(() => {
        if (dataServicesRootURI) {
            fetchRules();
        }
    }, [dataServicesRootURI, fetchRules]);

    // Listen for external updates (e.g. after uploading rules) and refresh list
    React.useEffect(() => {
        const handler = () => fetchRules();
        window.addEventListener('rules-updated', handler as EventListener);
        return () => window.removeEventListener('rules-updated', handler as EventListener);
    }, [fetchRules]);

    return (
        <div className="flex items-center gap-2">
            <Select
                value={value || "__empty__"}
                onValueChange={(newValue) => {
                    const actualValue = newValue === "__empty__" ? "" : newValue;
                    onRuleSelect(actualValue);
                }}
                disabled={disabled || isLoading || !rules.length}
            >
                <SelectTrigger className={className}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__empty__">{placeholder}</SelectItem>
                    {rules.map(rule => {
                        const ruleId = rule.identifier || rule.id;
                        const ruleName = rule.name || "Unnamed Rule";
                        return (
                            <SelectItem key={ruleId} value={ruleId}>
                                {ruleName} ({ruleId})
                            </SelectItem>
                        );
                    })}
                    {rules.length === 0 && !isLoading && (
                        <SelectItem disabled value="__no_rules__">No rules available</SelectItem>
                    )}
                    {isLoading && (
                        <SelectItem disabled value="__loading__">Loading...</SelectItem>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
};

export default SimpleRuleSelector;