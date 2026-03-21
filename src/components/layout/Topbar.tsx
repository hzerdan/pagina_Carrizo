import { Menu, Truck } from 'lucide-react';

interface TopbarProps {
    onMenuClick: () => void;
    title?: string;
    showBackButton?: boolean;
    onBackClick?: () => void;
}

export function Topbar({ onMenuClick, title = "Panel Logístico", showBackButton = false, onBackClick }: TopbarProps) {
    return (
        <header className="bg-brand-600 text-white shadow-md lg:hidden sticky top-0 z-30 flex items-center h-16 px-4">
            {showBackButton ? (
                <button
                    onClick={onBackClick}
                    className="p-2 -ml-2 mr-2 hover:bg-brand-700 rounded-full transition-colors flex items-center"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left"><path d="m15 18-6-6 6-6" /></svg>
                    <span className="sr-only">Volver</span>
                </button>
            ) : (
                <button
                    onClick={onMenuClick}
                    className="p-2 -ml-2 mr-2 hover:bg-brand-700 rounded-full transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
            )}

            {!showBackButton && (
                <Truck className="w-5 h-5 mr-3 opacity-90" />
            )}

            <h1 className="font-semibold text-lg truncate flex-1">
                {title}
            </h1>
        </header>
    );
}
