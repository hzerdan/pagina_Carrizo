import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './pages/Login';
import { MainLayout } from './components/layout/MainLayout';
import { ChatLayout } from './pages/Chat/ChatLayout';
import { MonitorPage } from './pages/Monitor/MonitorPage';
import { RemitosList } from './pages/RemitosList';
import { RemitoEdit } from './pages/RemitoEdit';
import { ChoferesManager } from './pages/ChoferesManager';
import { ClientesManager } from './pages/ClientesManager';
import { ProveedoresManager } from './pages/ProveedoresManager';
import { TransportistasManager } from './pages/TransportistasManager';
import { LugaresPesajeManager } from './pages/LugaresPesajeManager';
import { ArticulosManager } from './pages/ArticulosManager';
import { DepositosManager } from './pages/DepositosManager';
import PersonalManager from './components/PersonalManager';
import { PlantillasManager } from './pages/PlantillasManager';
import { CatalogoTareasManager } from './pages/CatalogoTareasManager';
import { LogisticaPoliticasManager } from './pages/LogisticaPoliticasManager';
import { InspeccionesKanbanPage } from './pages/Inspecciones/InspeccionesKanbanPage';
import { RecursosTecnicos } from './pages/RecursosTecnicos';
import { MisionEstadosManager } from './pages/MisionEstadosManager';
import { MisionTiposManager } from './pages/MisionTiposManager';

const PublicInspectPage = lazy(() => import('./pages/PublicInspect/PublicInspectPage'));

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route 
              path="/inspect/:token" 
              element={
                <Suspense fallback={
                  <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                    <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500 font-medium">Cargando portal de inspección...</p>
                  </div>
                }>
                  <PublicInspectPage />
                </Suspense>
              } 
            />
            <Route element={<MainLayout />}>
            <Route path="/" element={<ChatLayout />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/remitos" element={<RemitosList />} />
            <Route path="/remitos/:id" element={<RemitoEdit />} />
            <Route path="/choferes" element={<ChoferesManager />} />
            <Route path="/personal" element={<PersonalManager />} />
            <Route path="/clientes" element={<ClientesManager />} />
            <Route path="/proveedores" element={<ProveedoresManager />} />
            <Route path="/transportistas" element={<TransportistasManager />} />
            <Route path="/lugares-pesaje" element={<LugaresPesajeManager />} />
            <Route path="/articulos" element={<ArticulosManager />} />
            <Route path="/depositos" element={<DepositosManager />} />
            <Route path="/plantillas" element={<PlantillasManager />} />
            <Route path="/catalogo-tareas" element={<CatalogoTareasManager />} />
            <Route path="/mision-estados" element={<MisionEstadosManager />} />
            <Route path="/mision-tipos" element={<MisionTiposManager />} />
            <Route path="/logistica-politicas" element={<LogisticaPoliticasManager />} />
            <Route path="/inspecciones" element={<InspeccionesKanbanPage />} />
            <Route path="/recursos-tecnicos" element={<RecursosTecnicos />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
