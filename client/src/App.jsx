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
import './styles/puzzle.css';

// Root component: wraps the app in routing and global providers
export default function App() {
  return (
    <BrowserRouter>
      {/* Global state providers: user handle, sound settings, and floating notifications */}
      <UserProvider>
        <SoundProvider>
          <ToastProvider>
            <Routes>
              {/* Homepage*/}
              <Route path="/" element={<HomePage />} />

              {/* Game arena: SocketProvider connects only on the play screen */}
              <Route
                path="/play"
                element={
                  <SocketProvider>
                    <GamePage />
                  </SocketProvider>
                }
              />

              {/* Review Page */}
              <Route path="/review" element={<ReviewPage />} />

              {/* Redirect unknown routes back to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </SoundProvider>
      </UserProvider>
    </BrowserRouter>
  );
}
