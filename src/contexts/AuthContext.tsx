import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    personalAcId: number | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    personalAcId: null,
    loading: true,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [personalAcId, setPersonalAcId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPersonalData = async (userId: string) => {
            const { data, error } = await supabase
                .from('personal_ac')
                .select('id')
                .eq('auth_user_id', userId)
                .single();

            if (error) {
                console.error("Error fetching personal_ac data:", error);
                setPersonalAcId(null);
            } else if (data) {
                setPersonalAcId(data.id);
            }
        };

        const handleAuthSession = (session: Session | null) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchPersonalData(session.user.id).finally(() => setLoading(false));
            } else {
                setPersonalAcId(null);
                setLoading(false);
            }
        };

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleAuthSession(session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                handleAuthSession(session);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, user, personalAcId, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};
