import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import { SoundProvider } from './context/SoundContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';

import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import ReviewPage from './pages/ReviewPage';

import './styles/editorial.css';
import './styles/board.css';
import './styles/home.css';
import './styles/review.css';

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <SoundProvider>
          <ToastProvider>
            <Routes>
              {/* Homepage: Static & fast (No WebSocket overhead) */}
              <Route path="/" element={<HomePage />} />

              {/* Game Arena: Real-time Socket.io active only when playing */}
              <Route
                path="/play"
                element={
                  <SocketProvider>
                    <GamePage />
                  </SocketProvider>
                }
              />

              {/* Review Debrief: REST API evaluation (No WebSocket needed) */}
              <Route path="/review" element={<ReviewPage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </SoundProvider>
      </UserProvider>
    </BrowserRouter>
  );
}
