import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import { MainLayout } from './components/layout/MainLayout';
import { ChatLayout } from './pages/Chat/ChatLayout';
import { MonitorPage } from './pages/Monitor/MonitorPage';
import { RemitosList } from './pages/RemitosList';
import { RemitoEdit } from './pages/RemitoEdit';
import { ChoferesManager } from './pages/ChoferesManager';
import PersonalManager from './components/PersonalManager';

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
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
