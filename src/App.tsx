import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './pages/MainPage';
import PrivacyPage from './pages/PrivacyPage';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root to /main per user request */}
        <Route path="/" element={<Navigate to="/main" replace />} />
        
        {/* Main Gallery Page */}
        <Route path="/main" element={<MainPage />} />
        
        {/* Individual Privacy Policy Page */}
        <Route path="/privacy" element={<PrivacyPage />} />
        
        {/* Catch-all redirect to main */}
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </Router>
  );
}
