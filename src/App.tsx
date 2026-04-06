import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
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
import PersonalManager from './components/PersonalManager';
import { PlantillasManager } from './pages/PlantillasManager';
import { InspeccionesKanbanPage } from './pages/Inspecciones/InspeccionesKanbanPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="/plantillas" element={<PlantillasManager />} />
            <Route path="/inspecciones" element={<InspeccionesKanbanPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
