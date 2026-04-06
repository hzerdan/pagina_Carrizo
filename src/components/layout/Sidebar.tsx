import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, LogOut, Truck, X, LayoutDashboard, Database, ChevronDown, ChevronRight, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { pathname } = useLocation();
    const { signOut, user } = useAuth();

    const [isMaestrosOpen, setIsMaestrosOpen] = useState(false);

    const navLinks = [
        { name: 'Atención de Chat', path: '/', icon: MessageSquare, disabled: false },
        { name: 'Monitor de Instancias', path: '/monitor', icon: LayoutDashboard, disabled: false },
        { name: 'Monitor de Remitos', path: '/remitos', icon: Truck, disabled: false },
        { name: 'Inspecciones Documentales', path: '/inspecciones', icon: ClipboardCheck, disabled: false },
    ];

    const maestrosLinks = [
        { name: 'Clientes', path: '/clientes', disabled: false },
        { name: 'Proveedores', path: '/proveedores', disabled: false },
        { name: 'Empresas Transp.', path: '/transportistas', disabled: false },
        { name: 'Lugares Pesaje', path: '/lugares-pesaje', disabled: false },
        { name: 'Artículos', path: '/articulos', disabled: false },
        { name: 'Choferes', path: '/choferes', disabled: false },
        { name: 'Personal AC', path: '/personal', disabled: false },
        { name: 'Plantillas Documentales', path: '/plantillas', disabled: false },
    ];

    return (
        <>
            {/* Mobile Drawer Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Content */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl lg:shadow-md transform lg:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-6 bg-brand-600 text-white">
                    <div className="flex items-center gap-3">
                        <Truck className="w-6 h-6" />
                        <span className="font-bold text-lg tracking-tight">Arquímedes</span>
                    </div>
                    <button onClick={onClose} className="lg:hidden p-1 hover:bg-brand-700 rounded-lg">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* User Info */}
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center font-bold">
                        {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-semibold text-gray-900 truncate">{user?.email}</p>
                        <p className="text-xs text-gray-500">Operador Logístico</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.path;

                        return (
                            <Link
                                key={link.name}
                                to={link.path}
                                onClick={() => onClose()}
                                className={cn(
                                    "flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-colors",
                                    isActive
                                        ? "bg-brand-50 text-brand-700"
                                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                )}
                            >
                                <Icon className={cn(
                                    "mr-3 flex-shrink-0 h-5 w-5",
                                    isActive ? "text-brand-600" : "text-gray-400 group-hover:text-gray-500"
                                )} />
                                {link.name}
                            </Link>
                        );
                    })}

                    {/* Maestros Collapsible Menu */}
                    <div>
                        <button
                            onClick={() => setIsMaestrosOpen(!isMaestrosOpen)}
                            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                            <div className="flex items-center">
                                <Database className="mr-3 flex-shrink-0 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                                Entidades Maestras
                            </div>
                            {isMaestrosOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                        </button>

                        {isMaestrosOpen && (
                            <div className="pl-11 pr-4 py-1 flex flex-col space-y-1">
                                {maestrosLinks.map((link) => {
                                    const isActive = pathname === link.path;
                                    return (
                                        <Link
                                            key={link.name}
                                            to={link.path}
                                            onClick={() => onClose()}
                                            className={cn(
                                                "block px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                                                isActive
                                                    ? "bg-brand-50 text-brand-700"
                                                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                            )}
                                        >
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </nav>

                {/* Logout area */}
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    >
                        <LogOut className="mr-3 h-5 w-5" />
                        Cerrar Sesión
                    </button>
                </div>
            </aside>
        </>
    );
}
