import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

export function MainLayout() {
    const { session, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="h-screen flex overflow-hidden bg-gray-50">
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            <div className="flex-1 flex flex-col min-w-0 lg:pl-72 h-full">
                <Topbar onMenuClick={() => setSidebarOpen(true)} />

                <main className="flex-1 overflow-hidden flex flex-col h-[calc(100vh-4rem)] lg:h-screen">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
