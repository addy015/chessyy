import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Masthead from '../components/common/Masthead';
import Footer from '../components/common/Footer';
import IdentityModal from '../components/common/IdentityModal';
import { useUser } from '../context/UserContext';

const SAMPLE_ACCENTS = [27, 28, 35, 36, 18, 45];

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isEditModalOpen } = useUser();

  const [selectedHomeTc, setSelectedHomeTc] = useState('rapid_10_0');
  const [selectedFriendTc, setSelectedFriendTc] = useState('rapid_10_0');
  const [hoverCoord, setHoverCoord] = useState('');

  // Friend modal state initialized from URL params if present
  const inviteCode = searchParams.get('join')?.trim().toUpperCase() || '';
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(Boolean(inviteCode));
  const [activeTab, setActiveTab] = useState(inviteCode ? 'join' : 'create');
  const [joinCode, setJoinCode] = useState(inviteCode);
  const [joinError, setJoinError] = useState('');

  // Keyboard shortcut: [Enter] or [Space] starts match if no modal open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isEditModalOpen || isFriendModalOpen) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        navigate(`/play?tc=${encodeURIComponent(selectedHomeTc)}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditModalOpen, isFriendModalOpen, selectedHomeTc, navigate]);

  const handleGenerateRoom = () => {
    const roomCode = generateRoomCode();
    navigate(`/play?room=${encodeURIComponent(roomCode)}&role=host&tc=${encodeURIComponent(selectedFriendTc)}`);
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const sanitized = joinCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!sanitized || sanitized.length < 3) {
      setJoinError('Please enter a valid room code (at least 3 characters).');
      return;
    }
    navigate(`/play?room=${encodeURIComponent(sanitized)}&role=guest`);
  };

  return (
    <>
      <Masthead />

      <main className="home-container">
        {/* 12-Column Background Grid Lines */}
        <div className="editorial-grid-overlay">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="editorial-grid-line" />
          ))}
        </div>

        <section className="home-hero">
          {/* Left Hero Content */}
          <div className="hero-content">
            <h1 className="hero-title">
              THE ARCHITECTURE<br />
              OF <span className="title-accent">THOUGHT.</span>
            </h1>

            <p className="hero-subtext">
              64 squares. 32 pieces. Two minds locked in silence. A real-time multiplayer arena. <br />
              Just 2 players trying to outthink each other before the flag falls.
            </p>

            {/* Time Control Selector */}
            <div className="time-control-selector" id="home-tc-selector">
              <span className="tc-selector-label">PACE:</span>
              <div className="tc-pills-row" role="radiogroup" aria-label="Select match time control">
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'bullet_1_0' ? 'active' : ''}`}
                  title="1 minute bullet"
                  onClick={() => setSelectedHomeTc('bullet_1_0')}
                >
                  1m
                </button>
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'blitz_3_0' ? 'active' : ''}`}
                  title="3 minutes blitz"
                  onClick={() => setSelectedHomeTc('blitz_3_0')}
                >
                  3m
                </button>
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'blitz_3_2' ? 'active' : ''}`}
                  title="3 minutes + 2s increment"
                  onClick={() => setSelectedHomeTc('blitz_3_2')}
                >
                  3+2
                </button>
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'rapid_5_0' ? 'active' : ''}`}
                  title="5 minutes rapid"
                  onClick={() => setSelectedHomeTc('rapid_5_0')}
                >
                  5m
                </button>
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'rapid_10_0' ? 'active' : ''}`}
                  title="10 minutes standard rapid"
                  onClick={() => setSelectedHomeTc('rapid_10_0')}
                >
                  10m
                </button>
                <button
                  type="button"
                  className={`tc-pill ${selectedHomeTc === 'unlimited' ? 'active' : ''}`}
                  title="No chess clocks"
                  onClick={() => setSelectedHomeTc('unlimited')}
                >
                  &infin;
                </button>
              </div>
            </div>

            {/* Start Playing Buttons */}
            <div className="cta-wrapper">
              <button
                type="button"
                className="btn-play-now"
                id="home-play-cta"
                onClick={() => navigate(`/play?tc=${encodeURIComponent(selectedHomeTc)}`)}
              >
                <span>PLAY NOW</span>
              </button>
              <button
                type="button"
                className="btn-play-friends"
                id="home-friends-cta"
                onClick={() => setIsFriendModalOpen(true)}
              >
                <span>PLAY WITH A FRIEND</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </button>
            </div>
          </div>

          {/* Right Visual: 8x8 Abstract Matrix */}
          <div className="home-visual">
            <div className="abstract-board-matrix" id="hero-matrix" title="64 SQUARES / ABSTRACT GEOMETRY">
              {Array.from({ length: 8 }).map((_, r) =>
                Array.from({ length: 8 }).map((_, c) => {
                  const idx = r * 8 + c;
                  const isShaded = (r + c) % 2 === 1;
                  const isAccent = SAMPLE_ACCENTS.includes(idx);
                  const coord = `${String.fromCharCode(97 + c)}${8 - r}`;

                  return (
                    <div
                      key={idx}
                      className={`matrix-cell ${isShaded ? 'shaded' : ''} ${isAccent ? 'active-accent' : ''}`}
                      data-coord={coord}
                      onMouseEnter={() => setHoverCoord(coord.toUpperCase())}
                      onMouseLeave={() => setHoverCoord('')}
                    >
                      {isAccent && <>&bull;</>}
                    </div>
                  );
                })
              )}
            </div>

            <div className="matrix-caption">
              <span>CENTER OCCUPATION</span>
              <span>{hoverCoord ? `HOVER TARGET [${hoverCoord}]` : 'COORDINATES [E4, D4, E5, D5]'}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Play With Friends Modal */}
      {isFriendModalOpen && (
        <div
          id="friend-modal"
          className="editorial-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFriendModalOpen(false);
          }}
        >
          <div className="editorial-modal-box">
            <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div className="modal-protocol-tag" style={{ marginBottom: 0 }}>PROTOCOL 02 / PRIVATE MATCH</div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsFriendModalOpen(false)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <h2 className="modal-headline modal-headline-sm" style={{ marginBottom: '20px' }}>PLAY WITH A FRIEND</h2>

            <div className="friend-modal-tabs">
              <button
                type="button"
                className={`friend-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
                onClick={() => setActiveTab('create')}
              >
                CREATE ROOM
              </button>
              <button
                type="button"
                className={`friend-tab-btn ${activeTab === 'join' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('join');
                  setJoinError('');
                }}
              >
                JOIN WITH CODE
              </button>
            </div>

            {activeTab === 'create' && (
              <div id="tab-create-content" className="friend-tab-panel">
                <p className="modal-body-text" style={{ marginBottom: '16px' }}>
                  Generate a unique 6-character room code. You will play as <strong>White</strong>; your friend will join with the code as <strong>Black</strong>.
                </p>
                <div className="friend-tc-section" style={{ marginBottom: '20px' }}>
                  <span className="tc-selector-label" style={{ display: 'block', marginBottom: '8px' }}>MATCH PACE:</span>
                  <div className="tc-pills-row" id="friend-tc-pills" role="radiogroup">
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'bullet_1_0' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('bullet_1_0')}>1m</button>
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'blitz_3_0' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('blitz_3_0')}>3m</button>
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'blitz_3_2' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('blitz_3_2')}>3+2</button>
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'rapid_5_0' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('rapid_5_0')}>5m</button>
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'rapid_10_0' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('rapid_10_0')}>10m</button>
                    <button type="button" className={`tc-pill ${selectedFriendTc === 'unlimited' ? 'active' : ''}`} onClick={() => setSelectedFriendTc('unlimited')}>&infin;</button>
                  </div>
                </div>
                <div className="friend-action-box">
                  <button
                    type="button"
                    className="btn-play-now"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleGenerateRoom}
                  >
                    <span>GENERATE CODE &amp; ENTER &rarr;</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'join' && (
              <div id="tab-join-content" className="friend-tab-panel">
                <p className="modal-body-text" style={{ marginBottom: '16px' }}>
                  Enter the team code provided by your friend to join their match as <strong>Black</strong>.
                </p>
                <form onSubmit={handleJoinSubmit}>
                  <div className="friend-input-wrapper">
                    <input
                      type="text"
                      className="friend-code-input"
                      placeholder="ENTER ROOM CODE"
                      maxLength={16}
                      autoComplete="off"
                      spellCheck="false"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        if (joinError) setJoinError('');
                      }}
                    />
                  </div>
                  {joinError && (
                    <div className="friend-error-text" style={{ marginTop: '8px' }}>
                      {joinError}
                    </div>
                  )}
                  <div className="friend-action-box" style={{ marginTop: '16px' }}>
                    <button
                      type="submit"
                      className="btn-play-now"
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      <span>JOIN MATCH &rarr;</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      <IdentityModal />
      <Footer />
    </>
  );
}
