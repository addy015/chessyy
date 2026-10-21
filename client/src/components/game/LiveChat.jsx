import React, { useState, useEffect, useRef } from 'react';

// In-game live chat panel with quick reaction buttons
function LiveChat({ messages = [], onSendMessage }) {
  const [inputText, setInputText] = useState('');
  const scrollContainerRef = useRef(null);
  const isInitialMount = useRef(true);

  // Auto-scroll chat feed to the newest message without jumping the whole browser window
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
      return;
    }

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message on form submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  // Send quick reaction message (e.g., GL, GG)
  const handleCanned = (msg) => {
    onSendMessage(msg);
  };

  return (
    <div className="dispatch-wrapper">
      {/* Quick reaction canned buttons */}
      <div className="quick-reactions">
        <button
          type="button"
          className="btn-canned"
          onClick={() => handleCanned('Good luck & play well.')}
        >
          GL
        </button>
        <button
          type="button"
          className="btn-canned"
          onClick={() => handleCanned('Well played!')}
        >
          GG
        </button>
        <button
          type="button"
          className="btn-canned"
          onClick={() => handleCanned('Tough position.')}
        >
          TUFF
        </button>
      </div>

      {/* Chat Messages Feed (Scrolls internally ONLY, never scrolls window) */}
      <div className="dispatch-messages" id="dispatch-messages" ref={scrollContainerRef}>
        {messages.length === 0 ? (
          <div className="dispatch-placeholder">
            [Remember, he/she is your opponent, not your enemy.]
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={m.id || idx} className={`dispatch-msg ${m.isSelf ? 'self' : ''}`}>
              <div className="dispatch-msg-header">
                <span className="dispatch-sender">{m.senderLabel || m.sender}:</span>
                <span className="dispatch-time">{m.timestamp || ''}</span>
              </div>
              <div className="dispatch-msg-body">{m.text}</div>
            </div>
          ))
        )}
      </div>

      {/* Chat Input Form */}
      <form id="dispatch-form" className="dispatch-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          id="dispatch-input"
          className="dispatch-input"
          placeholder="Message opponent (max 200)..."
          maxLength={200}
          autoComplete="off"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button type="submit" id="send-dispatch-btn" className="btn-editorial btn-send">
          SEND
        </button>
      </form>
    </div>
  );
}

export default React.memo(LiveChat);

