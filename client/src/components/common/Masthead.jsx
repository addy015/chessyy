import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUser } from '../../context/UserContext';

export default function Masthead() {
  const { handle, openEditModal } = useUser();
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '';

  return (
    <header className="editorial-masthead">
      <div className="editorial-masthead-inner">
        {/* Logo and brand link */}
        <Link to="/" className="brand-mark">
          <span>CHESSYY</span>
        </Link>

        {/* Player Identity Badge */}
        <div className="player-identity-masthead" id="masthead-identity-container">
          <span className="player-id-label">PLAYER /</span>
          <span className="player-name-display" id="masthead-player-name">{handle}</span>
          {isHome && (
            <button
              type="button"
              id="masthead-edit-name-btn"
              className="btn-edit-name"
              title="Change your handle (Max 10 chars)"
              aria-label="Edit player handle"
              onClick={openEditModal}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
