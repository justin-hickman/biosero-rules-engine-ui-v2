import React from 'react';

// Simple localStorage-backed hook to mimic useKV behavior used in the project
export const useKV = <T,>(key: string, initialValue: T) => {
    const [state, setState] = React.useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return initialValue;
            return JSON.parse(raw) as T;
        } catch (e) {
            console.warn('useKV parse error', e);
            return initialValue;
        }
    });

    React.useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn('useKV write error', e);
        }
    }, [key, state]);

    return [state, (v: T | ((prev: T) => T)) => {
        setState((prev) => typeof v === 'function' ? (v as any)(prev) : v);
    }] as const;
};

export default useKV;
