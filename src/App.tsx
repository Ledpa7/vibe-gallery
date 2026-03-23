import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './pages/MainPage';
import PrivacyPage from './pages/PrivacyPage';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Mount MainPage at root to avoid token loss during redirect */}
        <Route path="/" element={<MainPage />} />
        
        {/* Still keep /main route accessible as requested */}
        <Route path="/main" element={<MainPage />} />
        
        {/* Individual Privacy Policy Page */}
        <Route path="/privacy" element={<PrivacyPage />} />
        
        {/* 404 Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

    </Router>
  );
}
